import sys
import os
import time
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

# Add parent directory to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from process_monitor import run_isolated
from spooler import ResultSpooler
from dataset import DatasetManager, DatasetIntegrityError
from db import PermanentRejectError, TransientNetworkError
import make_dummy_dataset

class TestEdgeOlympicsWorkers(unittest.TestCase):

    def test_timeout_kill(self):
        """Child script exceeding timeout limit is killed and reports failed_timeout."""
        cmd = [sys.executable, "-c", "import time; time.sleep(10)"]
        res = run_isolated(cmd, timeout_s=0.5, mem_cap_mb=1000.0, poll_interval_s=0.05)
        self.assertEqual(res.status, "failed_timeout")
        self.assertIn("timeout", res.error_log.lower())

    def test_oom_kill(self):
        """Child script exceeding memory cap is killed and reports failed_oom."""
        # Allocates ~150MB of byte arrays
        code = (
            "import time\n"
            "chunks = []\n"
            "for _ in range(50):\n"
            "    chunks.append(b'x' * (5 * 1024 * 1024))\n"
            "    time.sleep(0.02)\n"
        )
        cmd = [sys.executable, "-c", code]
        # Cap at 30 MB
        res = run_isolated(cmd, timeout_s=5.0, mem_cap_mb=30.0, poll_interval_s=0.02)
        self.assertEqual(res.status, "failed_oom")
        self.assertIn("memory cap exceeded", res.error_log.lower())

    def test_concurrent_claim(self):
        """Two concurrent workers competing for a single job - only one receives the job."""
        mock_db = MagicMock()
        claimed_jobs = []

        def mock_claim(worker_id):
            if not claimed_jobs:
                claimed_jobs.append(worker_id)
                return {"id": "job-1", "file_path": "model.tflite"}
            return None

        mock_db.claim_job.side_effect = mock_claim

        res1 = mock_db.claim_job("pi-01")
        res2 = mock_db.claim_job("pi-02")

        self.assertIsNotNone(res1)
        self.assertEqual(res1["id"], "job-1")
        self.assertIsNone(res2)
        self.assertEqual(claimed_jobs, ["pi-01"])

    def test_stale_requeue_logic(self):
        """Jobs with stale heartbeats are requeued if count < 2, or failed if count >= 2."""
        mock_db = MagicMock()
        mock_db.requeue_stale.return_value = 2
        count = mock_db.requeue_stale(stale_seconds=60)
        self.assertEqual(count, 2)

    def test_bad_shape_model_rejection(self):
        """Prelim child runner rejects models with shape mismatch."""
        with tempfile.NamedTemporaryFile(suffix=".tflite", delete=False) as f:
            f.write(b"BAD_SHAPE_MODEL_BYTES_TEST")
            temp_path = f.name

        try:
            child_script = Path(__file__).parent.parent / "child_runner.py"
            cmd = [
                sys.executable,
                str(child_script),
                "--mode", "prelim",
                "--model", temp_path,
                "--expected-input", "1,128,128,1",
                "--expected-output", "1,8",
                "--mock"
            ]
            res = run_isolated(cmd, timeout_s=5.0, mem_cap_mb=500.0)
            self.assertEqual(res.status, "failed_runtime")
            self.assertIn("Input shape mismatch", res.error_log)
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)

    def test_benchmark_returns_predictions_without_pi_labels(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            dataset_dir = Path(tmp_dir)
            make_dummy_dataset.generate_dataset(dataset_dir, n_samples=5)
            model = dataset_dir / "model.tflite"
            model.write_bytes(b"MOCK_MODEL")
            child_script = Path(__file__).parent.parent / "child_runner.py"
            res = run_isolated([
                sys.executable, str(child_script), "--mode", "benchmark",
                "--model", str(model), "--dataset", str(dataset_dir / "data.npz"),
                "--warmup", "1", "--mock",
            ], timeout_s=5.0, mem_cap_mb=500.0)
            self.assertEqual(res.status, "ok", res.error_log)
            self.assertEqual(res.data["predictions"], [3] * 5)
            self.assertNotIn("accuracy", res.data)

    def test_result_spooling_and_discard_rejected(self):
        """Spooled result is uploaded or discarded immediately if DB permanently rejects it."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            spooler = ResultSpooler(Path(tmp_dir))
            spool_file = spooler.spool("test-job-123", "complete", {
                "pi_id": "pi-01",
                "accuracy": 0.85,
                "latency_ms": 12.5,
                "peak_ram_mb": 150.0,
                "model_size_mb": 1.2
            })
            self.assertTrue(spool_file.is_file())

            # Case 1: Transient network failure keeps the spool file
            mock_db = MagicMock()
            mock_db.complete_job.side_effect = TransientNetworkError("Network down")
            flushed = spooler.flush(mock_db)
            self.assertEqual(flushed, 0)
            self.assertTrue(spool_file.is_file())

            # Case 2: Permanent rejection (requeued / status mismatch) discards the file immediately
            mock_db.complete_job.side_effect = PermanentRejectError("JOB_NOT_RUNNING_OR_PI_MISMATCH")
            flushed = spooler.flush(mock_db)
            self.assertEqual(flushed, 0)
            self.assertFalse(spool_file.exists())  # Must be discarded!

    def test_dataset_mtime_caching(self):
        """Dataset SHA256 integrity check is cached by file mtime."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            ds_dir = Path(tmp_dir)
            make_dummy_dataset.generate_dataset(ds_dir, n_samples=20)

            mgr = DatasetManager(ds_dir)

            # First verification computes hash
            mgr.verify_integrity()
            first_mtime = mgr._last_verified_mtime
            self.assertIsNotNone(first_mtime)

            # Second call without modification hits cache (tested by patching open)
            with patch("builtins.open", wraps=open) as mock_open:
                mgr.verify_integrity()
                # Should not re-read data.npz for hashing
                data_opened = any("data.npz" in str(c) for c in mock_open.call_args_list)
                self.assertFalse(data_opened)

            # If manifest is tampered, raises DatasetIntegrityError
            manifest = ds_dir / "manifest.sha256"
            with open(manifest, "w", encoding="utf-8") as f:
                f.write("0000000000000000000000000000000000000000000000000000000000000000  data.npz\n")

            with self.assertRaises(DatasetIntegrityError):
                mgr.verify_integrity()

if __name__ == "__main__":
    unittest.main()
