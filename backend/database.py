from __future__ import annotations

import os
import sqlite3
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from judge import JudgeResult


DEFAULT_DATABASE_PATH = Path(__file__).resolve().parents[1] / "data" / "judge.db"


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

    def connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=5)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA journal_mode = WAL")
        return connection

    def initialize(self) -> None:
        with self.connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS submissions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
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

    def create(self, code: str, result: JudgeResult) -> SubmissionRecord:
        runtime_ms = round(sum(test.runtime for test in result.tests) * 1000)
        submitted_at = datetime.now(UTC).isoformat()
        with self.connect() as connection:
            cursor = connection.execute(
                """
                INSERT INTO submissions (
                    problem_id, code, status, passed, total, runtime_ms, submitted_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
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

    def get(self, submission_id: int) -> SubmissionRecord | None:
        with self.connect() as connection:
            row = connection.execute(
                """
                SELECT id, problem_id, status, passed, total, runtime_ms, submitted_at
                FROM submissions
                WHERE id = ?
                """,
                (submission_id,),
            ).fetchone()
        return SubmissionRecord(**dict(row)) if row else None
