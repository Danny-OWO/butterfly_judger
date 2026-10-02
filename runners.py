from __future__ import annotations

import os
import subprocess
import sys
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol


@dataclass(frozen=True)
class ExecutionResult:
    returncode: int | None
    stdout: str
    stderr: str
    runtime: float
    timed_out: bool = False


class Runner(Protocol):
    def run(
        self,
        solution_path: Path,
        stdin: str,
        time_limit: float,
        memory_limit_mb: int,
    ) -> ExecutionResult: ...


class LocalRunner:
    """Runs trusted code locally. Never use this runner for a public API."""

    def run(
        self,
        solution_path: Path,
        stdin: str,
        time_limit: float,
        memory_limit_mb: int,
    ) -> ExecutionResult:
        del memory_limit_mb  # The local Phase 1 runner cannot enforce this limit.
        environment = os.environ.copy()
        environment["PYTHONIOENCODING"] = "utf-8"
        started_at = time.perf_counter()
        try:
            completed = subprocess.run(
                [sys.executable, str(solution_path)],
                input=stdin,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=time_limit,
                cwd=solution_path.parent,
                env=environment,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            return ExecutionResult(
                returncode=None,
                stdout=exc.stdout or "",
                stderr=exc.stderr or "",
                runtime=time.perf_counter() - started_at,
                timed_out=True,
            )

        return ExecutionResult(
            returncode=completed.returncode,
            stdout=completed.stdout,
            stderr=completed.stderr,
            runtime=time.perf_counter() - started_at,
        )


class DockerRunner:
    """Runs one test case in a short-lived, resource-limited container."""

    def __init__(self, image: str = "butterfly-python-runner:latest") -> None:
        self.image = image

    def build_command(
        self,
        solution_path: Path,
        memory_limit_mb: int,
        container_name: str,
    ) -> list[str]:
        mount = (
            f"type=bind,source={solution_path.resolve()},"
            "target=/workspace/main.py,readonly"
        )
        return [
            "docker",
            "run",
            "--rm",
            "--name",
            container_name,
            "--network",
            "none",
            "--memory",
            f"{memory_limit_mb}m",
            "--cpus",
            "0.5",
            "--pids-limit",
            "64",
            "--read-only",
            "--cap-drop",
            "ALL",
            "--security-opt",
            "no-new-privileges",
            "--tmpfs",
            "/tmp:rw,noexec,nosuid,size=16m",
            "--mount",
            mount,
            "-i",
            self.image,
            "python",
            "-I",
            "/workspace/main.py",
        ]

    def run(
        self,
        solution_path: Path,
        stdin: str,
        time_limit: float,
        memory_limit_mb: int,
    ) -> ExecutionResult:
        container_name = f"butterfly-{uuid.uuid4().hex}"
        command = self.build_command(solution_path, memory_limit_mb, container_name)
        started_at = time.perf_counter()
        try:
            completed = subprocess.run(
                command,
                input=stdin,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=time_limit,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            subprocess.run(
                ["docker", "rm", "--force", container_name],
                capture_output=True,
                timeout=5,
                check=False,
            )
            return ExecutionResult(
                returncode=None,
                stdout=exc.stdout or "",
                stderr=exc.stderr or "",
                runtime=time.perf_counter() - started_at,
                timed_out=True,
            )
        except FileNotFoundError as exc:
            raise RuntimeError(
                "Docker is not installed or is not available on PATH"
            ) from exc

        return ExecutionResult(
            returncode=completed.returncode,
            stdout=completed.stdout,
            stderr=completed.stderr,
            runtime=time.perf_counter() - started_at,
        )
