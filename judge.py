from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

from runners import DockerRunner, LocalRunner, Runner


PROJECT_ROOT = Path(__file__).resolve().parent
PROBLEMS_ROOT = PROJECT_ROOT / "problems"
PROBLEM_ID_PATTERN = re.compile(r"[A-Za-z0-9_-]+")
STDERR_LIMIT = 2_000


class JudgeConfigurationError(Exception):
    """Raised when a problem or its test cases are malformed."""


@dataclass(frozen=True)
class TestCase:
    name: str
    input_path: Path
    output_path: Path


@dataclass(frozen=True)
class TestResult:
    name: str
    status: str
    runtime: float
    stderr: str = ""


@dataclass(frozen=True)
class JudgeResult:
    problem_id: str
    title: str
    status: str
    passed: int
    total: int
    tests: tuple[TestResult, ...]


def load_problem(problem_id: str, problems_root: Path = PROBLEMS_ROOT) -> dict:
    if not PROBLEM_ID_PATTERN.fullmatch(problem_id):
        raise JudgeConfigurationError(f"Invalid problem id: {problem_id!r}")

    metadata_path = problems_root / problem_id / "problem.json"
    if not metadata_path.is_file():
        raise JudgeConfigurationError(f"Problem not found: {problem_id}")

    try:
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise JudgeConfigurationError(
            f"Cannot read valid JSON from {metadata_path}"
        ) from exc

    time_limit = metadata.get("time_limit", 2.0)
    if not isinstance(time_limit, (int, float)) or isinstance(time_limit, bool):
        raise JudgeConfigurationError("time_limit must be a positive number")
    if time_limit <= 0:
        raise JudgeConfigurationError("time_limit must be a positive number")

    return metadata


def load_test_cases(
    problem_id: str, problems_root: Path = PROBLEMS_ROOT
) -> tuple[TestCase, ...]:
    tests_dir = problems_root / problem_id / "tests"
    if not tests_dir.is_dir():
        raise JudgeConfigurationError(f"Tests directory not found: {tests_dir}")

    input_files = {path.stem: path for path in tests_dir.glob("*.in")}
    output_files = {path.stem: path for path in tests_dir.glob("*.out")}

    missing_outputs = sorted(input_files.keys() - output_files.keys())
    missing_inputs = sorted(output_files.keys() - input_files.keys())
    if missing_outputs or missing_inputs:
        details: list[str] = []
        if missing_outputs:
            details.append(f"missing .out for: {', '.join(missing_outputs)}")
        if missing_inputs:
            details.append(f"missing .in for: {', '.join(missing_inputs)}")
        raise JudgeConfigurationError("Incomplete test cases: " + "; ".join(details))

    if not input_files:
        raise JudgeConfigurationError(f"No test cases found in {tests_dir}")

    return tuple(
        TestCase(name, input_files[name], output_files[name])
        for name in sorted(input_files)
    )


def run_test(
    solution_path: Path,
    test: TestCase,
    time_limit: float,
    memory_limit_mb: int,
    runner: Runner,
) -> TestResult:
    test_input = test.input_path.read_text(encoding="utf-8")
    expected_output = test.output_path.read_text(encoding="utf-8")
    execution = runner.run(
        solution_path,
        test_input,
        time_limit,
        memory_limit_mb,
    )

    if execution.timed_out:
        return TestResult(test.name, "TLE", execution.runtime)

    if execution.returncode != 0:
        stderr = execution.stderr.strip()
        if len(stderr) > STDERR_LIMIT:
            stderr = stderr[:STDERR_LIMIT] + "\n... (stderr truncated)"
        return TestResult(test.name, "RE", execution.runtime, stderr)

    if execution.stdout != expected_output:
        return TestResult(test.name, "WA", execution.runtime)

    return TestResult(test.name, "AC", execution.runtime)


def judge(
    problem_id: str,
    solution_path: Path,
    problems_root: Path = PROBLEMS_ROOT,
    runner: Runner | None = None,
) -> JudgeResult:
    solution_path = solution_path.resolve()
    if not solution_path.is_file():
        raise JudgeConfigurationError(f"Solution not found: {solution_path}")

    metadata = load_problem(problem_id, problems_root)
    tests = load_test_cases(problem_id, problems_root)
    time_limit = float(metadata.get("time_limit", 2.0))
    memory_limit_mb = int(metadata.get("memory_limit", 128))
    runner = runner or LocalRunner()

    results: list[TestResult] = []
    passed = 0
    overall_status = "AC"

    for test in tests:
        result = run_test(
            solution_path,
            test,
            time_limit,
            memory_limit_mb,
            runner,
        )
        results.append(result)
        if result.status == "AC":
            passed += 1
        else:
            overall_status = result.status
            break

    return JudgeResult(
        problem_id=problem_id,
        title=str(metadata.get("title", "Untitled")),
        status=overall_status,
        passed=passed,
        total=len(tests),
        tests=tuple(results),
    )


def print_result(result: JudgeResult) -> None:
    print(f"Problem {result.problem_id}: {result.title}\n")
    for test in result.tests:
        print(f"Test {test.name}: {test.status} ({test.runtime * 1000:.0f} ms)")
        if test.stderr:
            print("stderr:")
            print(test.stderr)
    print(f"\nResult: {result.status}")
    print(f"Passed: {result.passed}/{result.total}")


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Judge a Python solution against a problem's test cases."
    )
    parser.add_argument("problem_id", help="Problem directory name, for example 001")
    parser.add_argument("solution", type=Path, help="Path to the Python solution")
    parser.add_argument(
        "--runner",
        choices=("local", "docker"),
        default="local",
        help="Execution backend (default: local; only use with trusted code)",
    )
    parser.add_argument(
        "--docker-image",
        default="butterfly-python-runner:latest",
        help="Docker image used by --runner docker",
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    args = parse_args(argv)
    runner: Runner
    if args.runner == "docker":
        runner = DockerRunner(args.docker_image)
    else:
        runner = LocalRunner()
    try:
        result = judge(args.problem_id, args.solution, runner=runner)
    except (JudgeConfigurationError, OSError, RuntimeError) as exc:
        print(f"Judge error: {exc}", file=sys.stderr)
        return 2

    print_result(result)
    return 0 if result.status == "AC" else 1


if __name__ == "__main__":
    raise SystemExit(main())
