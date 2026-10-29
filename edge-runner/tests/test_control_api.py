import os
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from control_api import app, database


JOB_ID = "11111111-1111-4111-8111-111111111111"


class ControlApiTests(unittest.TestCase):
    def setUp(self):
        self.db = MagicMock()
        app.dependency_overrides[database] = lambda: self.db
        self.token_patch = patch.dict(os.environ, {"PI_TOKEN_01": "test-token"})
        self.token_patch.start()
        self.client = TestClient(app)
        self.auth = {"Authorization": "Bearer test-token"}

    def tearDown(self):
        self.client.close()
        self.token_patch.stop()
        app.dependency_overrides.clear()

    def test_authentication_and_claim_identity(self):
        self.assertEqual(self.client.post("/v1/claim").status_code, 401)
        self.assertEqual(self.client.post("/v1/claim", headers={"Authorization": "Bearer wrong"}).status_code, 401)
        self.assertEqual(self.client.get("/v1/whoami", headers=self.auth).json(), {"pi_id": "pi-01"})
        self.db.claim_job.return_value = {"id": JOB_ID, "file_path": "team/model.tflite"}
        response = self.client.post("/v1/claim", headers=self.auth)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["job"]["id"], JOB_ID)
        self.db.claim_job.assert_called_with("pi-01")

    def test_completion_requires_current_assignment_and_valid_metrics(self):
        self.db.get_running_job.return_value = None
        result = {"accuracy": 0.8, "latency_ms": 5.0, "peak_ram_mb": 100.0, "model_size_mb": 1.0}
        self.assertEqual(self.client.post(f"/v1/jobs/{JOB_ID}/complete", headers=self.auth, json=result).status_code, 409)
        self.db.complete_job.assert_not_called()

        self.db.get_running_job.return_value = {"id": JOB_ID, "file_path": "team/model.tflite"}
        self.assertEqual(self.client.post(f"/v1/jobs/{JOB_ID}/complete", headers=self.auth,
                                          json={**result, "accuracy": 1.5}).status_code, 422)
        self.db.complete_job.assert_not_called()
        self.db.complete_job.return_value = True
        self.assertEqual(self.client.post(f"/v1/jobs/{JOB_ID}/complete", headers=self.auth, json=result).status_code, 200)
        self.db.complete_job.assert_called_once()


if __name__ == "__main__":
    unittest.main()
