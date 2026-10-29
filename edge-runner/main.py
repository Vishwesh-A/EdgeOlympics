import sys
import signal
import argparse
from config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PI_API_URL, PI_API_TOKEN, PI_ID, WORKER_ID
from db import SupabaseWorkerClient
from api_client import PiApiClient
from prelim import run_prelim_loop
from runner import run_edge_runner_loop
from logger import get_logger

logger = get_logger("main")

def handle_signal(sig, frame):
    logger.info(f"Received signal {sig}. Initiating graceful shutdown...")
    sys.exit(0)

def main():
    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    parser = argparse.ArgumentParser(description="Edge Olympics Backend Worker")
    parser.add_argument("--prelim", action="store_true", help="Run prelim checker mode")
    parser.add_argument("--runner", action="store_true", help="Run Raspberry Pi edge runner mode")
    parser.add_argument("--mock", action="store_true", help="Run in mock mode (no hardware requirement)")
    parser.add_argument("--once", action="store_true", help="Run only one iteration and exit")
    args = parser.parse_args()

    if not args.prelim and not args.runner:
        parser.print_help()
        sys.exit(1)

    if args.prelim:
        if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
            logger.error("Prelim worker requires SUPABASE_URL and SUPABASE_SECRET_KEY (or legacy service-role key).")
            sys.exit(1)
        db = SupabaseWorkerClient()
    elif PI_API_URL and PI_API_TOKEN:
        db = PiApiClient(PI_API_URL, PI_API_TOKEN, PI_ID)
    else:
        logger.error("Pi worker requires PI_API_URL and PI_API_TOKEN.")
        sys.exit(1)

    if args.prelim:
        logger.info(f"Starting Prelim Checker (worker_id={WORKER_ID})...")
        run_prelim_loop(db, mock=args.mock, run_once=args.once)
    elif args.runner:
        logger.info(f"Starting Edge Pi Runner (PI_ID={PI_ID})...")
        run_edge_runner_loop(db, mock=args.mock, run_once=args.once)

if __name__ == "__main__":
    main()
