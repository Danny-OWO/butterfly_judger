from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from backend.database import SubmissionRecord, SubmissionStore
from judge import JudgeConfigurationError, PROBLEMS_ROOT, judge, load_problem
from runners import DockerRunner, Runner


DEFAULT_FRONTEND_ORIGINS = (
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "https://danny-owo.github.io",
)


class SubmissionRequest(BaseModel):
    problem_id: str = Field(pattern=r"^[A-Za-z0-9_-]+$", max_length=64)
    code: str = Field(min_length=1, max_length=50_000)


class TestResultResponse(BaseModel):
    name: str
    status: str
    runtime_ms: int


class SubmissionResponse(BaseModel):
    id: int
    problem_id: str
    status: str
    passed: int
    total: int
    tests: list[TestResultResponse]
    error: str | None = None
    runtime_ms: int
    submitted_at: str


class SubmissionHistoryResponse(BaseModel):
    id: int
    problem_id: str
    status: str
    passed: int
    total: int
    runtime_ms: int
    submitted_at: str


def frontend_origins() -> list[str]:
    configured = os.getenv("FRONTEND_ORIGINS")
    if not configured:
        return list(DEFAULT_FRONTEND_ORIGINS)
    return [origin.strip().rstrip("/") for origin in configured.split(",") if origin.strip()]


def get_runner() -> Runner:
    image = os.getenv("JUDGE_DOCKER_IMAGE", "butterfly-python-runner:latest")
    return DockerRunner(image)


def get_store() -> SubmissionStore:
    return SubmissionStore()


app = FastAPI(
    title="Butterfly Judger API",
    version="0.1.0",
    description="API for the Butterfly educational Python judge.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=frontend_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


def public_problem(metadata: dict) -> dict:
    allowed_fields = (
        "id",
        "title",
        "description",
        "input",
        "output",
        "sample_input",
        "sample_output",
        "time_limit",
        "memory_limit",
    )
    return {field: metadata[field] for field in allowed_fields if field in metadata}


@app.get("/api/problems")
def list_problems() -> list[dict]:
    problems: list[dict] = []
    if not PROBLEMS_ROOT.is_dir():
        return problems
    for directory in sorted(PROBLEMS_ROOT.iterdir()):
        if not directory.is_dir():
            continue
        try:
            problems.append(public_problem(load_problem(directory.name)))
        except JudgeConfigurationError:
            continue
    return problems


@app.get("/api/problems/{problem_id}")
def get_problem(problem_id: str) -> dict:
    try:
        return public_problem(load_problem(problem_id))
    except JudgeConfigurationError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/api/submissions", response_model=SubmissionResponse)
async def submit(
    submission: SubmissionRequest,
    runner: Annotated[Runner, Depends(get_runner)],
    store: Annotated[SubmissionStore, Depends(get_store)],
) -> SubmissionResponse:
    try:
        with tempfile.TemporaryDirectory(prefix="butterfly-submission-") as directory:
            solution_path = Path(directory) / "main.py"
            solution_path.write_text(submission.code, encoding="utf-8")
            result = await run_in_threadpool(
                judge,
                submission.problem_id,
                solution_path,
                PROBLEMS_ROOT,
                runner,
            )
    except JudgeConfigurationError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail="Judge runner is unavailable") from exc

    record = await run_in_threadpool(store.create, submission.code, result)
    failed_error = next((test.stderr for test in result.tests if test.stderr), None)
    return SubmissionResponse(
        id=record.id,
        problem_id=result.problem_id,
        status=result.status,
        passed=result.passed,
        total=result.total,
        tests=[
            TestResultResponse(
                name=test.name,
                status=test.status,
                runtime_ms=round(test.runtime * 1000),
            )
            for test in result.tests
        ],
        error=failed_error,
        runtime_ms=record.runtime_ms,
        submitted_at=record.submitted_at,
    )


def history_response(record: SubmissionRecord) -> SubmissionHistoryResponse:
    return SubmissionHistoryResponse(**record.__dict__)


@app.get("/api/submissions/{submission_id}", response_model=SubmissionHistoryResponse)
def get_submission(
    submission_id: int,
    store: Annotated[SubmissionStore, Depends(get_store)],
) -> SubmissionHistoryResponse:
    record = store.get(submission_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Submission not found")
    return history_response(record)
