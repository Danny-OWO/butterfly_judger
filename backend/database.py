from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Iterator

from judge import JudgeResult


DEFAULT_DATABASE_PATH = Path(__file__).resolve().parents[1] / "data" / "judge.db"


@dataclass(frozen=True)
class StudentRecord:
    id: int
    username: str


@dataclass(frozen=True)
class SubmissionRecord:
    id: int
    problem_id: str
    status: str
    passed: int
    total: int
    runtime_ms: int
    submitted_at: str


class SubmissionStore:
    def __init__(self, path: Path | str | None = None) -> None:
        configured_path = path or os.getenv("JUDGE_DB_PATH") or DEFAULT_DATABASE_PATH
        self.path = Path(configured_path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.initialize()

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.path, timeout=5)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA journal_mode = WAL")
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def initialize(self) -> None:
        with self.connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS students (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                    password_hash TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS sessions (
                    token_hash TEXT PRIMARY KEY,
                    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
                    expires_at TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS submissions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
                    problem_id TEXT NOT NULL,
                    code TEXT NOT NULL,
                    status TEXT NOT NULL,
                    passed INTEGER NOT NULL,
                    total INTEGER NOT NULL,
                    runtime_ms INTEGER NOT NULL,
                    submitted_at TEXT NOT NULL
                )
                """
            )
            columns = {
                row["name"]
                for row in connection.execute("PRAGMA table_info(submissions)").fetchall()
            }
            if "student_id" not in columns:
                connection.execute(
                    "ALTER TABLE submissions ADD COLUMN student_id INTEGER REFERENCES students(id)"
                )
            connection.execute(
                "CREATE INDEX IF NOT EXISTS idx_sessions_student ON sessions(student_id)"
            )
            connection.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_submissions_student_problem
                ON submissions(student_id, problem_id, submitted_at DESC)
                """
            )

    def create_student(self, username: str, password_hash: str) -> StudentRecord | None:
        created_at = datetime.now(UTC).isoformat()
        try:
            with self.connect() as connection:
                cursor = connection.execute(
                    "INSERT INTO students (username, password_hash, created_at) VALUES (?, ?, ?)",
                    (username, password_hash, created_at),
                )
                student_id = int(cursor.lastrowid)
        except sqlite3.IntegrityError:
            return None
        return StudentRecord(id=student_id, username=username)

    def get_student_credentials(self, username: str) -> tuple[StudentRecord, str] | None:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT id, username, password_hash FROM students WHERE username = ?",
                (username,),
            ).fetchone()
        if row is None:
            return None
        return StudentRecord(id=row["id"], username=row["username"]), row["password_hash"]

    def create_session(
        self, token_hash: str, student_id: int, expires_at: str
    ) -> None:
        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO sessions (token_hash, student_id, expires_at, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (token_hash, student_id, expires_at, datetime.now(UTC).isoformat()),
            )

    def student_for_session(self, token_hash: str) -> StudentRecord | None:
        now = datetime.now(UTC).isoformat()
        with self.connect() as connection:
            connection.execute("DELETE FROM sessions WHERE expires_at <= ?", (now,))
            row = connection.execute(
                """
                SELECT students.id, students.username
                FROM sessions
                JOIN students ON students.id = sessions.student_id
                WHERE sessions.token_hash = ? AND sessions.expires_at > ?
                """,
                (token_hash, now),
            ).fetchone()
        return StudentRecord(**dict(row)) if row else None

    def delete_session(self, token_hash: str) -> None:
        with self.connect() as connection:
            connection.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash,))

    def create(
        self, student_id: int, code: str, result: JudgeResult
    ) -> SubmissionRecord:
        runtime_ms = round(sum(test.runtime for test in result.tests) * 1000)
        submitted_at = datetime.now(UTC).isoformat()
        with self.connect() as connection:
            cursor = connection.execute(
                """
                INSERT INTO submissions (
                    student_id, problem_id, code, status, passed, total,
                    runtime_ms, submitted_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    student_id,
                    result.problem_id,
                    code,
                    result.status,
                    result.passed,
                    result.total,
                    runtime_ms,
                    submitted_at,
                ),
            )
            submission_id = int(cursor.lastrowid)
        return SubmissionRecord(
            id=submission_id,
            problem_id=result.problem_id,
            status=result.status,
            passed=result.passed,
            total=result.total,
            runtime_ms=runtime_ms,
            submitted_at=submitted_at,
        )

    def get(self, submission_id: int, student_id: int) -> SubmissionRecord | None:
        with self.connect() as connection:
            row = connection.execute(
                """
                SELECT id, problem_id, status, passed, total, runtime_ms, submitted_at
                FROM submissions
                WHERE id = ? AND student_id = ?
                """,
                (submission_id, student_id),
            ).fetchone()
        return SubmissionRecord(**dict(row)) if row else None

    def list_for_student(
        self, student_id: int, limit: int = 50
    ) -> list[SubmissionRecord]:
        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT id, problem_id, status, passed, total, runtime_ms, submitted_at
                FROM submissions
                WHERE student_id = ?
                ORDER BY submitted_at DESC
                LIMIT ?
                """,
                (student_id, limit),
            ).fetchall()
        return [SubmissionRecord(**dict(row)) for row in rows]

    def progress_for_student(self, student_id: int) -> list[dict[str, object]]:
        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT
                    problem_id,
                    COUNT(*) AS attempts,
                    MAX(passed) AS best_passed,
                    MAX(total) AS total,
                    MAX(CASE WHEN status = 'AC' THEN 1 ELSE 0 END) AS solved,
                    MAX(submitted_at) AS last_submitted_at
                FROM submissions
                WHERE student_id = ?
                GROUP BY problem_id
                ORDER BY problem_id
                """,
                (student_id,),
            ).fetchall()
        return [{**dict(row), "solved": bool(row["solved"])} for row in rows]
