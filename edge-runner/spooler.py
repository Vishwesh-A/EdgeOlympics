import json
import os
import shutil
from pathlib import Path
from typing import Dict, Any, List
from config import SPOOL_DIR
from db import SupabaseWorkerClient, PermanentRejectError, TransientNetworkError
from logger import get_logger

logger = get_logger("spooler")

class ResultSpooler:
    def __init__(self, spool_dir: Path = SPOOL_DIR):
        self.spool_dir = Path(spool_dir)
        self.spool_dir.mkdir(parents=True, exist_ok=True)

    def spool(self, job_id: str, kind: str, payload: Dict[str, Any]) -> Path:
        """Writes result to local JSON spool file."""
        spool_data = {
            "job_id": job_id,
            "kind": kind,  # 'complete' or 'fail'
            "payload": payload,
            "timestamp": os.path.getmtime(self.spool_dir) if self.spool_dir.exists() else 0,
        }
        target = self.spool_dir / f"{job_id}.json"
        temp_target = self.spool_dir / f"{job_id}.tmp"
        with open(temp_target, "w", encoding="utf-8") as f:
            json.dump(spool_data, f, indent=2)
        temp_target.replace(target)
        logger.warning(f"Spooled result for job {job_id} to {target}")
        return target

    def flush(self, db: SupabaseWorkerClient) -> int:
        """Tries to upload all spooled results. Discards permanently rejected results."""
        spool_files = sorted(self.spool_dir.glob("*.json"))
        if not spool_files:
            return 0

        flushed = 0
        for sp in spool_files:
            try:
                with open(sp, "r", encoding="utf-8") as f:
                    data = json.load(f)
            except Exception as e:
                logger.error(f"Corrupt spool file {sp}: {e}. Removing.")
                sp.unlink(missing_ok=True)
                continue

            job_id = data.get("job_id")
            kind = data.get("kind")
            payload = data.get("payload", {})

            try:
                if kind == "complete":
                    db.complete_job(
                        job_id=job_id,
                        pi_id=payload["pi_id"],
                        accuracy=payload["accuracy"],
                        latency_ms=payload["latency_ms"],
                        peak_ram_mb=payload["peak_ram_mb"],
                        model_size_mb=payload["model_size_mb"],
                        notes=payload.get("notes")
                    )
                elif kind == "fail":
                    db.fail_job(
                        job_id=job_id,
                        pi_id=payload["pi_id"],
                        fail_status=payload["fail_status"],
                        error_log=payload["error_log"]
                    )
                logger.info(f"Successfully uploaded spooled result for job {job_id}")
                sp.unlink(missing_ok=True)
                flushed += 1

            except PermanentRejectError as e:
                logger.warning(f"Discarding rejected spooled job {job_id}: {e}")
                sp.unlink(missing_ok=True)

            except TransientNetworkError as e:
                logger.warning(f"Network error flushing spooled job {job_id}: {e}. Will retry later.")
                break

            except Exception as e:
                logger.error(f"Unexpected error flushing spooled job {job_id}: {e}")
                break

        return flushed

    def clean_orphaned_models(self, temp_dirs: List[Path]) -> int:
        """Cleans orphaned .tflite files from previous runs."""
        cleaned = 0
        for d in temp_dirs:
            if not d.exists():
                continue
            for model_file in d.glob("**/*.tflite"):
                try:
                    model_file.unlink()
                    cleaned += 1
                except Exception as e:
                    logger.warning(f"Could not remove orphan file {model_file}: {e}")
        return cleaned
