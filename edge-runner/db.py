import os
import time
import json
from pathlib import Path
from typing import Optional, Dict, Any, List
import requests

from config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

class DatabaseError(Exception):
    """Base database exception."""
    pass

class PermanentRejectError(DatabaseError):
    """Raised when job is rejected because it is no longer running or pi_id mismatched."""
    pass

class TransientNetworkError(DatabaseError):
    """Raised on connection timeout or transient 5xx server error."""
    pass

class SupabaseWorkerClient:
    def __init__(self, url: str = SUPABASE_URL, key: str = SUPABASE_SERVICE_ROLE_KEY):
        self.url = url.rstrip("/")
        self.key = key
        self.session = requests.Session()
        headers = {
            "apikey": self.key,
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }
        # New sb_secret_ API keys are opaque values, not bearer JWTs.
        if not self.key.startswith("sb_secret_"):
            headers["Authorization"] = f"Bearer {self.key}"
        self.session.headers.update(headers)

    def _rpc(self, fn: str, payload: Dict[str, Any]) -> Any:
        url = f"{self.url}/rest/v1/rpc/{fn}"
        try:
            resp = self.session.post(url, json=payload, timeout=15)
        except (requests.ConnectionError, requests.Timeout) as e:
            raise TransientNetworkError(f"Network error calling {fn}: {e}") from e

        if resp.status_code == 200:
            return resp.json()

        # Handle rejection errors
        err_msg = ""
        try:
            err_json = resp.json()
            err_msg = err_json.get("message", resp.text)
        except Exception:
            err_msg = resp.text

        if "JOB_NOT_RUNNING_OR_PI_MISMATCH" in err_msg or resp.status_code == 409:
            raise PermanentRejectError(f"Job rejected by DB: {err_msg}")
        elif resp.status_code >= 500:
            raise TransientNetworkError(f"Server error {resp.status_code} calling {fn}: {err_msg}")
        else:
            raise DatabaseError(f"DB error {resp.status_code} calling {fn}: {err_msg}")

    # Prelim RPCs
    def claim_prelim_job(self, worker_id: str, timeout_s: int = 120) -> Optional[Dict[str, Any]]:
        data = self._rpc("claim_prelim_job", {"_worker_id": worker_id, "_timeout_seconds": timeout_s})
        if isinstance(data, list) and len(data) > 0:
            return data[0]
        return None

    def prelim_pass(self, job_id: str, worker_id: str) -> bool:
        return bool(self._rpc("prelim_pass", {"_id": job_id, "_worker_id": worker_id}))

    def prelim_fail(self, job_id: str, worker_id: str, error_log: str) -> bool:
        return bool(self._rpc("prelim_fail", {"_id": job_id, "_worker_id": worker_id, "_error_log": error_log}))

    # Edge Runner RPCs
    def claim_job(self, pi_id: str) -> Optional[Dict[str, Any]]:
        data = self._rpc("claim_job", {"_pi_id": pi_id})
        if isinstance(data, list) and len(data) > 0:
            return data[0]
        return None

    def heartbeat(self, job_id: str, pi_id: str) -> bool:
        return bool(self._rpc("heartbeat", {"_id": job_id, "_pi_id": pi_id}))

    def complete_job(
        self,
        job_id: str,
        pi_id: str,
        accuracy: Optional[float],
        latency_ms: float,
        peak_ram_mb: float,
        model_size_mb: float,
        notes: Optional[str] = None,
        predictions: Optional[List[int]] = None,
        dataset_sha256: Optional[str] = None,
    ) -> bool:
        if accuracy is None:
            raise ValueError("Direct Supabase completion requires server-computed accuracy")
        return bool(self._rpc("complete_job", {
            "_id": job_id,
            "_pi_id": pi_id,
            "_accuracy": round(float(accuracy), 4),
            "_latency_ms": round(float(latency_ms), 3),
            "_peak_ram_mb": round(float(peak_ram_mb), 2),
            "_model_size_mb": round(float(model_size_mb), 3),
            "_notes": notes
        }))

    def fail_job(self, job_id: str, pi_id: str, fail_status: str, error_log: str) -> bool:
        return bool(self._rpc("fail_job", {
            "_id": job_id,
            "_pi_id": pi_id,
            "_fail_status": fail_status,
            "_error_log": error_log
        }))

    def requeue_stale(self, stale_seconds: int = 60) -> int:
        res = self._rpc("requeue_stale", {"_stale_seconds": stale_seconds})
        return int(res) if res is not None else 0

    def worker_seen(self, pi_id: str) -> bool:
        return bool(self._rpc("worker_seen", {"_pi_id": pi_id}))

    # Storage operations
    def download_model(self, file_path: str, dest_path: Path, job_id: Optional[str] = None) -> None:
        url = f"{self.url}/storage/v1/object/models/{file_path}"
        try:
            resp = self.session.get(url, stream=True, timeout=30)
            if resp.status_code != 200:
                raise DatabaseError(f"Failed to download storage model {file_path}: {resp.status_code} {resp.text}")
            dest_path.parent.mkdir(parents=True, exist_ok=True)
            with open(dest_path, "wb") as f:
                for chunk in resp.iter_content(chunk_size=65536):
                    if chunk:
                        f.write(chunk)
        except (requests.ConnectionError, requests.Timeout) as e:
            raise TransientNetworkError(f"Network error downloading model: {e}") from e

    def get_running_job(self, job_id: str, pi_id: str) -> Optional[Dict[str, Any]]:
        """Resolve a model only for the Pi assigned to its running job."""
        try:
            resp = self.session.get(f"{self.url}/rest/v1/submissions", params={
                "select": "id,file_path,status,pi_id",
                "id": f"eq.{job_id}",
                "status": "eq.running",
                "pi_id": f"eq.{pi_id}",
                "limit": "1",
            }, timeout=15)
        except (requests.ConnectionError, requests.Timeout) as e:
            raise TransientNetworkError(f"Network error resolving job: {e}") from e
        if resp.status_code >= 500:
            raise TransientNetworkError(f"Supabase error resolving job: {resp.status_code}")
        if resp.status_code != 200:
            raise DatabaseError(f"Unable to resolve job: {resp.status_code} {resp.text}")
        rows = resp.json()
        return rows[0] if rows else None

    def stream_model(self, file_path: str):
        """Open a streaming Storage response; caller must close it."""
        try:
            resp = self.session.get(
                f"{self.url}/storage/v1/object/models/{file_path}",
                stream=True, timeout=(15, 60),
            )
        except (requests.ConnectionError, requests.Timeout) as e:
            raise TransientNetworkError(f"Network error downloading model: {e}") from e
        if resp.status_code != 200:
            resp.close()
            raise DatabaseError(f"Unable to download model: {resp.status_code}")
        return resp

    def delete_model(self, file_path: str) -> bool:
        url = f"{self.url}/storage/v1/object/models"
        try:
            resp = self.session.delete(url, json={"prefixes": [file_path]}, timeout=15)
            return resp.status_code in (200, 204)
        except Exception:
            # Don't fail the pipeline if delete fails; log and continue
            return False
