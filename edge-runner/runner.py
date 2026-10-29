import sys
import os
import time
import random
import threading
import tempfile
from pathlib import Path
from typing import Optional

from config import (
    PI_ID,
    TIMEOUT_S,
    MEM_CAP_MB,
    TEMP_LIMIT_C,
    POLL_INTERVAL_S,
    HEARTBEAT_INTERVAL_S,
    DATASET_DIR,
    WARMUP_RUNS
)
from db import SupabaseWorkerClient, PermanentRejectError, TransientNetworkError
from dataset import DatasetManager, DatasetIntegrityError
from thermal import ThermalManager
from spooler import ResultSpooler
from process_monitor import run_isolated
from logger import get_logger

logger = get_logger(f"pi_{PI_ID}")

class HeartbeatThread(threading.Thread):
    def __init__(self, db: SupabaseWorkerClient, job_id: str, pi_id: str, interval_s: float = HEARTBEAT_INTERVAL_S):
        super().__init__(daemon=True)
        self.db = db
        self.job_id = job_id
        self.pi_id = pi_id
        self.interval_s = interval_s
        self.stop_event = threading.Event()

    def run(self):
        while not self.stop_event.wait(self.interval_s):
            try:
                ok = self.db.heartbeat(self.job_id, self.pi_id)
                if not ok:
                    logger.warning(f"[pi:{self.pi_id}] [job:{self.job_id}] Heartbeat returned False (job requeued or status mismatch)")
            except Exception as e:
                logger.warning(f"[pi:{self.pi_id}] [job:{self.job_id}] Heartbeat network error: {e}")

    def stop(self):
        self.stop_event.set()

def process_single_edge_job(
    job: dict,
    db: SupabaseWorkerClient,
    dataset_mgr: DatasetManager,
    thermal_mgr: ThermalManager,
    spooler: ResultSpooler,
    mock: bool = False
) -> bool:
    job_id = job["id"]
    file_path = job.get("file_path") or ""
    orig_name = job.get("original_filename") or ""

    logger.info(f"[pi:{PI_ID}] [job:{job_id}] Claimed edge benchmark job: {orig_name}")

    # 1. Dataset verification (mtime cached)
    try:
        dataset_mgr.verify_integrity()
    except DatasetIntegrityError as e:
        logger.error(f"[pi:{PI_ID}] [job:{job_id}] Refusing job due to dataset integrity error: {e}")
        db.fail_job(job_id, PI_ID, "failed_runtime", f"Pi runner dataset integrity error: {str(e)}")
        return False

    # 2. Thermal check & cool down
    current_temp, throttled, cooled = thermal_mgr.wait_for_cooldown(max_wait_seconds=60)
    notes = []
    if not cooled:
        notes.append(f"High temp at start: {current_temp:.1f}C")
    if thermal_mgr.is_currently_throttled(throttled):
        notes.append(f"Throttled at start: hex {hex(throttled)}")

    temp_dir = Path(tempfile.gettempdir()) / "edge_olympics_runner"
    temp_dir.mkdir(parents=True, exist_ok=True)
    local_model = temp_dir / f"{job_id}.tflite"

    heartbeat_worker = HeartbeatThread(db, job_id, PI_ID)

    try:
        heartbeat_worker.start()
        # 3. Download model
        logger.info(f"[pi:{PI_ID}] [job:{job_id}] Downloading model: {file_path}")
        db.download_model(file_path, local_model, job_id=job_id)
        model_size_mb = local_model.stat().st_size / (1024.0 * 1024.0)

        # 4. Launch isolated child benchmark process
        child_script = Path(__file__).parent / "child_runner.py"
        cmd = [
            sys.executable,
            str(child_script),
            "--mode", "benchmark",
            "--model", str(local_model),
            "--dataset", str(dataset_mgr.data_file),
            "--warmup", str(WARMUP_RUNS),
        ]
        if mock:
            cmd.append("--mock")

        logger.info(f"[pi:{PI_ID}] [job:{job_id}] Executing benchmark child process...")
        res = run_isolated(cmd, timeout_s=TIMEOUT_S, mem_cap_mb=MEM_CAP_MB)

        # Stop heartbeat
        heartbeat_worker.stop()

        # Check for mid-run throttling
        end_temp, end_throttled = thermal_mgr.read_metrics()
        if thermal_mgr.is_currently_throttled(end_throttled):
            notes.append(f"Throttling occurred during run (hex {hex(end_throttled)})")

        notes_str = "; ".join(notes) if notes else None

        # 6. Handle benchmark outcome
        if res.status == "ok":
            accuracy = float(res.data.get("accuracy", 0.0))
            latency_ms = float(res.data.get("latency_ms", 0.0))
            peak_ram_mb = res.peak_ram_mb

            logger.info(
                f"[pi:{PI_ID}] [job:{job_id}] Benchmark completed: "
                f"acc={accuracy:.4f}, lat={latency_ms:.2f}ms, ram={peak_ram_mb:.1f}MB"
            )

            try:
                db.complete_job(
                    job_id=job_id,
                    pi_id=PI_ID,
                    accuracy=accuracy,
                    latency_ms=latency_ms,
                    peak_ram_mb=peak_ram_mb,
                    model_size_mb=model_size_mb,
                    notes=notes_str
                )
            except PermanentRejectError as e:
                logger.warning(f"[pi:{PI_ID}] [job:{job_id}] Job completion rejected by DB: {e}")
            except TransientNetworkError as e:
                logger.warning(f"[pi:{PI_ID}] [job:{job_id}] Network error completing job. Spooling to local disk: {e}")
                spooler.spool(job_id, "complete", {
                    "pi_id": PI_ID,
                    "accuracy": accuracy,
                    "latency_ms": latency_ms,
                    "peak_ram_mb": peak_ram_mb,
                    "model_size_mb": model_size_mb,
                    "notes": notes_str
                })
            return True

        else:
            fail_status = res.status  # 'failed_timeout', 'failed_oom', or 'failed_runtime'
            err_msg = res.error_log or "Benchmark execution failed"
            logger.warning(f"[pi:{PI_ID}] [job:{job_id}] Benchmark failed ({fail_status}): {err_msg}")

            try:
                db.fail_job(job_id, PI_ID, fail_status, err_msg)
            except PermanentRejectError as e:
                logger.warning(f"[pi:{PI_ID}] [job:{job_id}] Fail job rejected by DB: {e}")
            except TransientNetworkError as e:
                logger.warning(f"[pi:{PI_ID}] [job:{job_id}] Network error failing job. Spooling to local disk: {e}")
                spooler.spool(job_id, "fail", {
                    "pi_id": PI_ID,
                    "fail_status": fail_status,
                    "error_log": err_msg
                })
            return False

    except TransientNetworkError as e:
        # A network outage is not a participant failure. The stale-job lease
        # will requeue the assignment if this worker cannot finish it.
        logger.warning(f"[pi:{PI_ID}] [job:{job_id}] Temporary control API error: {e}")
        return False

    except Exception as e:
        logger.error(f"[pi:{PI_ID}] [job:{job_id}] Unexpected runner error: {e}")
        try:
            db.fail_job(job_id, PI_ID, "failed_runtime", f"Runner failure: {str(e)}")
        except Exception:
            pass
        return False

    finally:
        heartbeat_worker.stop()
        if local_model.exists():
            try:
                local_model.unlink()
            except Exception:
                pass

def run_edge_runner_loop(db: SupabaseWorkerClient, mock: bool = False, run_once: bool = False):
    logger.info(f"Starting Edge Pi Runner (PI_ID={PI_ID}, mock={mock})")

    dataset_mgr = DatasetManager(DATASET_DIR)
    thermal_mgr = ThermalManager(mock=mock, temp_limit_c=TEMP_LIMIT_C)
    spooler = ResultSpooler()

    # Startup checks
    temp_dirs = [
        Path(tempfile.gettempdir()) / "edge_olympics_runner",
        Path(tempfile.gettempdir()) / "edge_olympics_prelim"
    ]
    cleaned = spooler.clean_orphaned_models(temp_dirs)
    if cleaned > 0:
        logger.info(f"Cleaned {cleaned} orphaned model files on startup.")

    # Flush spooled results on startup
    try:
        flushed = spooler.flush(db)
        if flushed > 0:
            logger.info(f"Flushed {flushed} spooled results on startup.")
    except Exception as e:
        logger.warning(f"Initial spool flush encountered error: {e}")

    # Initial dataset manifest verification
    try:
        dataset_mgr.verify_integrity(force=True)
        logger.info(f"Verified dataset integrity at {dataset_mgr.data_file}")
    except DatasetIntegrityError as e:
        logger.critical(f"FATAL: Dataset manifest verification failed: {e}")
        if not mock:
            sys.exit(1)

    backoff = 1.0

    while True:
        try:
            # 1. Flush spooled results if any
            spooler.flush(db)

            # 2. Requeue stale jobs
            stale_count = db.requeue_stale(stale_seconds=60)
            if stale_count > 0:
                logger.info(f"Requeued/failed {stale_count} stale jobs.")

            # 3. Cool before claiming, so overheating never occupies a job lease.
            _, _, cooled = thermal_mgr.wait_for_cooldown(max_wait_seconds=60)
            if not cooled:
                logger.warning("Pi remains hot or throttled; waiting before claiming another job.")
                time.sleep(POLL_INTERVAL_S)
                continue

            # 4. Claim job
            job = db.claim_job(PI_ID)
            if job:
                backoff = 1.0
                process_single_edge_job(job, db, dataset_mgr, thermal_mgr, spooler, mock=mock)
                if run_once:
                    break
                continue

            backoff = 1.0

        except TransientNetworkError as e:
            logger.warning(f"Network error in runner loop: {e}. Backing off {backoff:.1f}s.")
            time.sleep(backoff)
            backoff = min(backoff * 2.0, 60.0)

        except Exception as e:
            logger.error(f"Error in runner loop: {e}")

        if run_once:
            break

        jitter = random.uniform(0.0, 1.5)
        time.sleep(POLL_INTERVAL_S + jitter)
