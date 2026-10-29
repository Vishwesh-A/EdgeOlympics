import os
import sys
from pathlib import Path

# Look for .env in current edge-runner directory or parent
def load_dotenv_simple():
    search_paths = [
        Path(__file__).parent / ".env",
        Path.cwd() / ".env",
        Path(__file__).parent.parent / ".env",
    ]
    for p in search_paths:
        if p.is_file():
            with open(p, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    k, v = line.split("=", 1)
                    k = k.strip()
                    v = v.strip().strip("'\"")
                    if k not in os.environ:
                        os.environ[k] = v
            break

load_dotenv_simple()

BASE_DIR = Path(__file__).resolve().parent

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = (
    os.environ.get("SUPABASE_SECRET_KEY")
    or os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
)
PI_API_URL = os.environ.get("PI_API_URL", "").rstrip("/")
PI_API_TOKEN = os.environ.get("PI_API_TOKEN", "")

PI_ID = os.environ.get("PI_ID", "pi-01")
WORKER_ID = os.environ.get("WORKER_ID", f"prelim-{os.getpid()}")

MAX_MB = float(os.environ.get("MAX_MB", "50.0"))
TIMEOUT_S = int(os.environ.get("TIMEOUT_S", "120"))
MEM_CAP_MB = float(os.environ.get("MEM_CAP_MB", "1200.0"))
TEMP_LIMIT_C = float(os.environ.get("TEMP_LIMIT_C", "75.0"))

DATASET_DIR = Path(os.environ.get("DATASET_DIR", "/opt/dataset"))
SPOOL_DIR = BASE_DIR / ".spool"
LOG_DIR = BASE_DIR / "logs"

POLL_INTERVAL_S = float(os.environ.get("POLL_INTERVAL_S", "5.0"))
HEARTBEAT_INTERVAL_S = float(os.environ.get("HEARTBEAT_INTERVAL_S", "10.0"))

INPUT_SHAPE = tuple(map(int, os.environ.get("INPUT_SHAPE", "1,128,128,1").split(",")))
OUTPUT_SHAPE = tuple(map(int, os.environ.get("OUTPUT_SHAPE", "1,8").split(",")))

WARMUP_RUNS = int(os.environ.get("WARMUP_RUNS", "5"))
PRELIM_TIMEOUT_S = int(os.environ.get("PRELIM_TIMEOUT_S", "10"))
PRELIM_MEM_CAP_MB = float(os.environ.get("PRELIM_MEM_CAP_MB", "500.0"))

SPOOL_DIR.mkdir(parents=True, exist_ok=True)
LOG_DIR.mkdir(parents=True, exist_ok=True)
