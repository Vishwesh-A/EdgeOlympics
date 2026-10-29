import sys
import os
import time
import random
import tempfile
from pathlib import Path
from typing import Optional

from config import (
    WORKER_ID,
    MAX_MB,
    PRELIM_TIMEOUT_S,
    PRELIM_MEM_CAP_MB,
    POLL_INTERVAL_S,
    INPUT_SHAPE,
    OUTPUT_SHAPE
)
from db import SupabaseWorkerClient, DatabaseError, TransientNetworkError
from process_monitor import run_isolated
from logger import get_logger

logger = get_logger("prelim_worker")

def process_single_prelim_job(job: dict, db: SupabaseWorkerClient, mock: bool = False) -> bool:
    job_id = job["id"]
    file_path = job.get("file_path") or ""
    orig_name = job.get("original_filename") or ""

    logger.info(f"[job:{job_id}] Claimed prelim job: {orig_name} ({file_path})")

    # Extension check
    ext = os.path.splitext(file_path)[1].lower()
    if ext != ".tflite":
        err_msg = f"Rejected file format '{ext}'. Only .tflite models are permitted."
        logger.warning(f"[job:{job_id}] {err_msg}")
        db.prelim_fail(job_id, WORKER_ID, err_msg)
        db.delete_model(file_path)
        return False

    temp_dir = Path(tempfile.gettempdir()) / "edge_olympics_prelim"
    temp_dir.mkdir(parents=True, exist_ok=True)
    local_model = temp_dir / f"{job_id}.tflite"

    try:
        # Download from Supabase Storage
        logger.info(f"[job:{job_id}] Downloading model from storage: {file_path}")
        db.download_model(file_path, local_model)

        # File size check
        size_mb = local_model.stat().st_size / (1024.0 * 1024.0)
        if size_mb > MAX_MB:
            err_msg = f"Model file size ({size_mb:.2f} MB) exceeds maximum allowed limit ({MAX_MB:.1f} MB)."
            logger.warning(f"[job:{job_id}] {err_msg}")
            db.prelim_fail(job_id, WORKER_ID, err_msg)
            db.delete_model(file_path)
            return False

        # Run model validation & dummy inference in isolated child process
        child_script = Path(__file__).parent / "child_runner.py"
        cmd = [
            sys.executable,
            str(child_script),
            "--mode", "prelim",
            "--model", str(local_model),
            "--expected-input", ",".join(map(str, INPUT_SHAPE)),
            "--expected-output", ",".join(map(str, OUTPUT_SHAPE)),
        ]
        if mock:
            cmd.append("--mock")

        res = run_isolated(cmd, timeout_s=PRELIM_TIMEOUT_S, mem_cap_mb=PRELIM_MEM_CAP_MB)

        if res.status != "ok":
            err_msg = res.error_log or "Prelim validation failed."
            logger.warning(f"[job:{job_id}] Prelim check failed: {err_msg}")
            db.prelim_fail(job_id, WORKER_ID, err_msg)
            db.delete_model(file_path)
            return False

        # Passed all checks
        logger.info(f"[job:{job_id}] Passed prelim checks. Transitioning to queued_for_edge.")
        db.prelim_pass(job_id, WORKER_ID)
        return True

    except TransientNetworkError as e:
        # Leave the pending job and model intact; the claim lease will expire.
        logger.warning(f"[job:{job_id}] Temporary Supabase error; will retry after lease expiry: {e}")
        return False

    except Exception as e:
        logger.error(f"[job:{job_id}] Unexpected error in prelim checker: {e}")
        try:
            db.prelim_fail(job_id, WORKER_ID, f"Internal prelim checker error: {str(e)}")
            db.delete_model(file_path)
        except Exception:
            pass
        return False

    finally:
        if local_model.exists():
            try:
                local_model.unlink()
            except Exception:
                pass

def run_prelim_loop(db: SupabaseWorkerClient, mock: bool = False, run_once: bool = False):
    logger.info(f"Starting prelim worker loop (worker_id={WORKER_ID}, mock={mock})")

    while True:
        try:
            job = db.claim_prelim_job(WORKER_ID, timeout_s=120)
            if job:
                process_single_prelim_job(job, db, mock=mock)
                if run_once:
                    break
                continue

        except TransientNetworkError as e:
            logger.warning(f"Transient network error claiming prelim job: {e}")
        except Exception as e:
            logger.error(f"Error in prelim loop: {e}")

        if run_once:
            break

        # Poll interval + random jitter
        jitter = random.uniform(0.0, 1.5)
        time.sleep(POLL_INTERVAL_S + jitter)
