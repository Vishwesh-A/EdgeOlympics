"""Narrow, authenticated API client used by Raspberry Pi workers."""
from pathlib import Path
from typing import Optional
from urllib.parse import quote

import requests

from db import DatabaseError, PermanentRejectError, TransientNetworkError


class PiApiClient:
    def __init__(self, base_url: str, token: str, pi_id: str):
        self.base_url = base_url.rstrip("/")
        if not self.base_url.startswith("https://") and not self.base_url.startswith("http://127.0.0.1:"):
            raise ValueError("PI_API_URL must use HTTPS")
        if not token:
            raise ValueError("PI_API_TOKEN is required")
        self.pi_id = pi_id
        self.session = requests.Session()
        self.session.headers.update({"Authorization": f"Bearer {token}"})

    def _request(self, method: str, path: str, **kwargs):
        try:
            response = self.session.request(method, self.base_url + path, timeout=(10, 60), **kwargs)
        except (requests.ConnectionError, requests.Timeout) as exc:
            raise TransientNetworkError(f"Control API unavailable: {exc}") from exc
        if response.status_code in (404, 409):
            raise PermanentRejectError(f"Job rejected by control API: {response.status_code}")
        if response.status_code >= 500:
            raise TransientNetworkError(f"Control API error: {response.status_code}")
        if response.status_code >= 400:
            raise DatabaseError(f"Control API rejected request: {response.status_code} {response.text}")
        return response

    def claim_job(self, pi_id: str):
        if pi_id != self.pi_id:
            raise ValueError("Pi identity mismatch")
        response = self._request("POST", "/v1/claim")
        payload = response.json()
        if payload.get("pi_id") != self.pi_id:
            raise DatabaseError("API token belongs to a different Pi identity")
        return payload.get("job")

    def whoami(self) -> str:
        pi_id = self._request("GET", "/v1/whoami").json().get("pi_id")
        if pi_id != self.pi_id:
            raise DatabaseError("API token belongs to a different Pi identity")
        return pi_id

    def heartbeat(self, job_id: str, pi_id: str) -> bool:
        self._check_pi(pi_id)
        return bool(self._request("POST", f"/v1/jobs/{quote(job_id)}/heartbeat").json()["ok"])

    def complete_job(self, job_id: str, pi_id: str, accuracy: float, latency_ms: float,
                     peak_ram_mb: float, model_size_mb: float, notes: Optional[str] = None) -> bool:
        self._check_pi(pi_id)
        return bool(self._request("POST", f"/v1/jobs/{quote(job_id)}/complete", json={
            "accuracy": accuracy, "latency_ms": latency_ms, "peak_ram_mb": peak_ram_mb,
            "model_size_mb": model_size_mb, "notes": notes,
        }).json()["ok"])

    def fail_job(self, job_id: str, pi_id: str, fail_status: str, error_log: str) -> bool:
        self._check_pi(pi_id)
        return bool(self._request("POST", f"/v1/jobs/{quote(job_id)}/fail", json={
            "fail_status": fail_status, "error_log": error_log,
        }).json()["ok"])

    def requeue_stale(self, stale_seconds: int = 60) -> int:
        # The control API owns this task; Pi workers never manipulate the queue.
        return 0

    def download_model(self, file_path: str, dest_path: Path, job_id: Optional[str] = None) -> None:
        if not job_id:
            raise ValueError("job_id is required for model download")
        response = self._request("GET", f"/v1/jobs/{quote(job_id)}/model", stream=True)
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            with open(dest_path, "wb") as target:
                try:
                    for chunk in response.iter_content(chunk_size=65536):
                        if chunk:
                            target.write(chunk)
                except (requests.ConnectionError, requests.Timeout) as exc:
                    raise TransientNetworkError(f"Model transfer interrupted: {exc}") from exc
        finally:
            response.close()

    def _check_pi(self, pi_id: str) -> None:
        if pi_id != self.pi_id:
            raise ValueError("Pi identity mismatch")
