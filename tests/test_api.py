from __future__ import annotations

import unittest
import tempfile
from pathlib import Path

try:
    from fastapi.testclient import TestClient

    from backend.database import SubmissionStore
    from backend.main import app, get_runner, get_store
    from runners import LocalRunner
except ModuleNotFoundError:
    TestClient = None


@unittest.skipIf(TestClient is None, "API development dependencies are not installed")
class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.temporary_directory = tempfile.TemporaryDirectory()
        cls.store = SubmissionStore(
            Path(cls.temporary_directory.name) / "test-judge.db"
        )
        app.dependency_overrides[get_runner] = LocalRunner
        app.dependency_overrides[get_store] = lambda: cls.store
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls) -> None:
        app.dependency_overrides.clear()
        cls.temporary_directory.cleanup()

    def test_health(self) -> None:
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_lists_public_problem_without_hidden_tests(self) -> None:
        response = self.client.get("/api/problems")
        self.assertEqual(response.status_code, 200)
        problem = response.json()[0]
        self.assertEqual(problem["id"], "001")
        self.assertNotIn("tests", problem)

    def test_accepts_correct_submission(self) -> None:
        response = self.client.post(
            "/api/submissions",
            json={
                "problem_id": "001",
                "code": "a, b = map(int, input().split())\nprint(a + b)\n",
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "AC")
        self.assertEqual(response.json()["passed"], 2)
        self.assertIsInstance(response.json()["id"], int)

        history = self.client.get(f"/api/submissions/{response.json()['id']}")
        self.assertEqual(history.status_code, 200)
        self.assertEqual(history.json()["status"], "AC")
        self.assertNotIn("code", history.json())

    def test_rejects_empty_code(self) -> None:
        response = self.client.post(
            "/api/submissions",
            json={"problem_id": "001", "code": ""},
        )
        self.assertEqual(response.status_code, 422)

    def test_missing_submission_is_404(self) -> None:
        response = self.client.get("/api/submissions/999999")
        self.assertEqual(response.status_code, 404)
