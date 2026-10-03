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
        registration = cls.client.post(
            "/api/auth/register",
            json={"username": "alice", "password": "correct-horse-123"},
        )
        if registration.status_code != 201:
            raise RuntimeError(f"Test registration failed: {registration.text}")

    @classmethod
    def tearDownClass(cls) -> None:
        cls.client.close()
        app.dependency_overrides.clear()
        cls.temporary_directory.cleanup()

    def test_health(self) -> None:
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_local_frontend_can_send_authenticated_requests(self) -> None:
        response = self.client.options(
            "/api/auth/login",
            headers={
                "Origin": "http://127.0.0.1:8080",
                "Access-Control-Request-Method": "POST",
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.headers["access-control-allow-origin"],
            "http://127.0.0.1:8080",
        )
        self.assertEqual(response.headers["access-control-allow-credentials"], "true")

    def test_session_identifies_current_student(self) -> None:
        response = self.client.get("/api/auth/me")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["username"], "alice")
        self.assertNotIn("password", response.json())

    def test_duplicate_username_is_rejected_case_insensitively(self) -> None:
        response = self.client.post(
            "/api/auth/register",
            json={"username": "ALICE", "password": "another-password"},
        )
        self.assertEqual(response.status_code, 409)

    def test_login_cookie_and_logout(self) -> None:
        with TestClient(app) as browser:
            login = browser.post(
                "/api/auth/login",
                json={"username": "alice", "password": "correct-horse-123"},
            )
            self.assertEqual(login.status_code, 200)
            self.assertIn("HttpOnly", login.headers["set-cookie"])
            self.assertEqual(browser.get("/api/auth/me").status_code, 200)

            logout = browser.post("/api/auth/logout")
            self.assertEqual(logout.status_code, 204)
            self.assertEqual(browser.get("/api/auth/me").status_code, 401)

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

        submissions = self.client.get("/api/submissions")
        self.assertEqual(submissions.status_code, 200)
        self.assertEqual(submissions.json()[0]["id"], response.json()["id"])

        progress = self.client.get("/api/progress")
        self.assertEqual(progress.status_code, 200)
        problem = next(item for item in progress.json() if item["problem_id"] == "001")
        self.assertTrue(problem["solved"])
        self.assertGreaterEqual(problem["attempts"], 1)

    def test_rejects_empty_code(self) -> None:
        response = self.client.post(
            "/api/submissions",
            json={"problem_id": "001", "code": ""},
        )
        self.assertEqual(response.status_code, 422)

    def test_missing_submission_is_404(self) -> None:
        response = self.client.get("/api/submissions/999999")
        self.assertEqual(response.status_code, 404)

    def test_submission_requires_a_session(self) -> None:
        with TestClient(app) as anonymous:
            response = anonymous.post(
                "/api/submissions",
                json={"problem_id": "001", "code": "print(1)"},
            )
        self.assertEqual(response.status_code, 401)

    def test_student_cannot_read_another_students_submission(self) -> None:
        alice_submission = self.client.post(
            "/api/submissions",
            json={
                "problem_id": "001",
                "code": "a, b = map(int, input().split())\nprint(a + b)\n",
            },
        ).json()["id"]
        with TestClient(app) as bob:
            registration = bob.post(
                "/api/auth/register",
                json={"username": "bob", "password": "a-safe-password"},
            )
            self.assertEqual(registration.status_code, 201)
            self.assertEqual(
                bob.get(f"/api/submissions/{alice_submission}").status_code,
                404,
            )
