"""Vast-hosted control plane. Only this process needs the Supabase service key."""
import hmac
import math
import os
import threading
import time
from functools import lru_cache
from typing import Literal, Optional
from uuid import UUID

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
from db import DatabaseError, PermanentRejectError, SupabaseWorkerClient, TransientNetworkError

app = FastAPI(title="Edge Olympics control plane", docs_url=None, redoc_url=None)
_requeue_lock = threading.Lock()
_last_requeue = 0.0


@lru_cache
def database() -> SupabaseWorkerClient:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(503, "Supabase is not configured")
    return SupabaseWorkerClient()


def authenticate(authorization: Optional[str] = Header(default=None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Worker token required")
    supplied = authorization[7:]
    for index in range(1, 5):
        pi_id = f"pi-{index:02d}"
        expected = os.environ.get(f"PI_TOKEN_{index:02d}", "")
        if expected and hmac.compare_digest(supplied, expected):
            return pi_id
    raise HTTPException(401, "Invalid worker token")


def db_call(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except PermanentRejectError as exc:
        raise HTTPException(409, str(exc)) from exc
    except TransientNetworkError as exc:
        raise HTTPException(503, str(exc)) from exc
    except DatabaseError as exc:
        raise HTTPException(502, str(exc)) from exc


def active_job(db: SupabaseWorkerClient, job_id: UUID, pi_id: str):
    job = db_call(db.get_running_job, str(job_id), pi_id)
    if not job:
        raise HTTPException(409, "Job is no longer assigned to this Pi")
    return job


class Completion(BaseModel):
    accuracy: float = Field(ge=0, le=1)
    latency_ms: float = Field(gt=0)
    peak_ram_mb: float = Field(gt=0)
    model_size_mb: float = Field(gt=0, le=50)
    notes: Optional[str] = Field(default=None, max_length=1000)


class Failure(BaseModel):
    fail_status: Literal["failed_runtime", "failed_timeout", "failed_oom", "disqualified"]
    error_log: str = Field(min_length=1, max_length=2000)


@app.get("/health")
def health():
    return {"ok": True, "supabase_configured": bool(SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)}


@app.post("/v1/claim")
def claim(pi_id: str = Depends(authenticate), db: SupabaseWorkerClient = Depends(database)):
    global _last_requeue
    db_call(db.worker_seen, pi_id)
    with _requeue_lock:
        if time.monotonic() - _last_requeue >= 30:
            db_call(db.requeue_stale, 180)
            _last_requeue = time.monotonic()
    job = db_call(db.claim_job, pi_id)
    return {"pi_id": pi_id, "job": job}


@app.get("/v1/jobs/{job_id}/model")
def model(job_id: UUID, pi_id: str = Depends(authenticate), db: SupabaseWorkerClient = Depends(database)):
    job = active_job(db, job_id, pi_id)
    path = job.get("file_path") or ""
    if not path.lower().endswith(".tflite"):
        raise HTTPException(409, "Unsupported model format")
    response = db_call(db.stream_model, path)

    def content():
        try:
            yield from response.iter_content(chunk_size=65536)
        finally:
            response.close()

    return StreamingResponse(content(), media_type="application/octet-stream")


@app.post("/v1/jobs/{job_id}/heartbeat")
def heartbeat(job_id: UUID, pi_id: str = Depends(authenticate), db: SupabaseWorkerClient = Depends(database)):
    if not db_call(db.heartbeat, str(job_id), pi_id):
        raise HTTPException(409, "Job is no longer assigned to this Pi")
    db_call(db.worker_seen, pi_id)
    return {"ok": True}


@app.post("/v1/jobs/{job_id}/complete")
def complete(job_id: UUID, result: Completion, pi_id: str = Depends(authenticate),
             db: SupabaseWorkerClient = Depends(database)):
    values = [result.accuracy, result.latency_ms, result.peak_ram_mb, result.model_size_mb]
    if not all(math.isfinite(value) for value in values):
        raise HTTPException(422, "Metrics must be finite")
    active_job(db, job_id, pi_id)
    if not db_call(db.complete_job, str(job_id), pi_id, result.accuracy, result.latency_ms,
                   result.peak_ram_mb, result.model_size_mb, result.notes):
        raise HTTPException(409, "Job completion was rejected")
    return {"ok": True}


@app.post("/v1/jobs/{job_id}/fail")
def fail(job_id: UUID, result: Failure, pi_id: str = Depends(authenticate),
         db: SupabaseWorkerClient = Depends(database)):
    active_job(db, job_id, pi_id)
    if not db_call(db.fail_job, str(job_id), pi_id, result.fail_status, result.error_log):
        raise HTTPException(409, "Job failure was rejected")
    return {"ok": True}
