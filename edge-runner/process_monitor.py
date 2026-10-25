import sys
import time
import json
import subprocess
from typing import List, Tuple, Optional, Dict, Any
import psutil

class ProcessResult:
    def __init__(
        self,
        status: str,  # 'ok', 'failed_timeout', 'failed_oom', 'failed_runtime'
        data: Optional[Dict[str, Any]] = None,
        error_log: str = "",
        peak_ram_mb: float = 0.0
    ):
        self.status = status
        self.data = data or {}
        self.error_log = error_log
        self.peak_ram_mb = peak_ram_mb

def run_isolated(
    cmd: List[str],
    timeout_s: float,
    mem_cap_mb: float,
    poll_interval_s: float = 0.05
) -> ProcessResult:
    """
    Executes a command in an isolated child process.
    Parent polls psutil for memory cap and enforces hard wall-clock timeout.
    """
    start_time = time.time()
    peak_ram = 0.0

    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
    except Exception as e:
        return ProcessResult(
            status="failed_runtime",
            error_log=f"Failed to spawn runner process: {str(e)}",
            peak_ram_mb=0.0
        )

    try:
        ps_proc = psutil.Process(proc.pid)
    except psutil.NoSuchProcess:
        ps_proc = None

    oom_killed = False
    timeout_killed = False

    while proc.poll() is None:
        elapsed = time.time() - start_time
        if elapsed > timeout_s:
            timeout_killed = True
            _kill_tree(proc)
            break

        if ps_proc:
            try:
                rss_bytes = ps_proc.memory_info().rss
                for child in ps_proc.children(recursive=True):
                    try:
                        rss_bytes += child.memory_info().rss
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        pass

                current_ram_mb = rss_bytes / (1024.0 * 1024.0)
                if current_ram_mb > peak_ram:
                    peak_ram = current_ram_mb

                if current_ram_mb > mem_cap_mb:
                    oom_killed = True
                    _kill_tree(proc)
                    break
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass

        time.sleep(poll_interval_s)

    stdout, stderr = proc.communicate()
    exit_code = proc.returncode

    if timeout_killed:
        return ProcessResult(
            status="failed_timeout",
            error_log=f"Execution exceeded timeout limit ({timeout_s}s)",
            peak_ram_mb=peak_ram
        )

    if oom_killed:
        return ProcessResult(
            status="failed_oom",
            error_log=f"Memory cap exceeded: {peak_ram:.1f} MB > {mem_cap_mb:.1f} MB",
            peak_ram_mb=peak_ram
        )

    # Check for external SIGKILL (exit code -9 on Unix or 137 on Linux/Docker)
    if exit_code in (-9, 137):
        return ProcessResult(
            status="failed_oom",
            error_log="Process terminated by OOM killer (signal 9)",
            peak_ram_mb=peak_ram
        )

    if exit_code != 0:
        err_msg = ""
        # Try parse structured JSON from stdout
        for line in stdout.splitlines():
            line = line.strip()
            if line.startswith("{") and line.endswith("}"):
                try:
                    parsed = json.loads(line)
                    if "message" in parsed:
                        err_msg = parsed["message"]
                        break
                except Exception:
                    pass

        if not err_msg:
            err_msg = stderr.strip().splitlines()[-1] if stderr.strip() else f"Process exited with code {exit_code}"

        return ProcessResult(
            status="failed_runtime",
            error_log=err_msg,
            peak_ram_mb=peak_ram
        )

    # Exit code 0
    parsed_data = {}
    for line in stdout.splitlines():
        line = line.strip()
        if line.startswith("{") and line.endswith("}"):
            try:
                parsed_data = json.loads(line)
                break
            except Exception:
                pass

    if parsed_data.get("status") == "error":
        return ProcessResult(
            status="failed_runtime",
            error_log=parsed_data.get("message", "Unknown runtime error"),
            peak_ram_mb=peak_ram
        )

    return ProcessResult(
        status="ok",
        data=parsed_data,
        peak_ram_mb=peak_ram
    )

def _kill_tree(proc: subprocess.Popen):
    try:
        parent = psutil.Process(proc.pid)
        for child in parent.children(recursive=True):
            try:
                child.kill()
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
        parent.kill()
    except (psutil.NoSuchProcess, psutil.AccessDenied):
        try:
            proc.kill()
        except Exception:
            pass
