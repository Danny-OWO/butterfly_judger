from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from judge import JudgeConfigurationError, judge
from runners import DockerRunner


class JudgeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary_directory.name)
        self.problems_root = self.root / "problems"
        self.problem_dir = self.problems_root / "001"
        self.tests_dir = self.problem_dir / "tests"
        self.tests_dir.mkdir(parents=True)
        (self.problem_dir / "problem.json").write_text(
            json.dumps({"title": "Test", "time_limit": 0.2}),
            encoding="utf-8",
        )
        (self.tests_dir / "01.in").write_text("3 5\n", encoding="utf-8")
        (self.tests_dir / "01.out").write_text("8\n", encoding="utf-8")

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def write_solution(self, source: str) -> Path:
        path = self.root / "solution.py"
        path.write_text(source, encoding="utf-8")
        return path

    def test_accepts_correct_solution(self) -> None:
        result = judge(
            "001",
            self.write_solution(
                "a, b = map(int, input().split())\nprint(a + b)\n"
            ),
            self.problems_root,
        )
        self.assertEqual(result.status, "AC")
        self.assertEqual((result.passed, result.total), (1, 1))

    def test_reports_wrong_answer(self) -> None:
        result = judge(
            "001",
            self.write_solution("print(0)\n"),
            self.problems_root,
        )
        self.assertEqual(result.status, "WA")
        self.assertEqual(result.tests[0].name, "01")

    def test_reports_runtime_error(self) -> None:
        result = judge(
            "001",
            self.write_solution("raise RuntimeError('boom')\n"),
            self.problems_root,
        )
        self.assertEqual(result.status, "RE")
        self.assertIn("RuntimeError: boom", result.tests[0].stderr)

    def test_reports_time_limit_exceeded(self) -> None:
        result = judge(
            "001",
            self.write_solution("while True:\n    pass\n"),
            self.problems_root,
        )
        self.assertEqual(result.status, "TLE")

    def test_output_comparison_is_strict(self) -> None:
        trailing_space = judge(
            "001",
            self.write_solution("print('8 ')\n"),
            self.problems_root,
        )
        self.assertEqual(trailing_space.status, "WA")

        missing_newline = judge(
            "001",
            self.write_solution("import sys\nsys.stdout.write('8')\n"),
            self.problems_root,
        )
        self.assertEqual(missing_newline.status, "WA")

    def test_rejects_incomplete_test_pair(self) -> None:
        (self.tests_dir / "01.out").unlink()
        solution = self.write_solution("print(8)\n")
        with self.assertRaisesRegex(JudgeConfigurationError, "missing .out"):
            judge("001", solution, self.problems_root)

    def test_rejects_path_traversal_problem_id(self) -> None:
        solution = self.write_solution("print(8)\n")
        with self.assertRaisesRegex(JudgeConfigurationError, "Invalid problem id"):
            judge("../001", solution, self.problems_root)

    def test_docker_command_contains_sandbox_limits(self) -> None:
        solution = self.write_solution("print(8)\n")
        command = DockerRunner("test-image").build_command(
            solution, 128, "test-container"
        )
        self.assertIn("none", command)
        self.assertIn("128m", command)
        self.assertIn("--read-only", command)
        self.assertIn("--pids-limit", command)
        self.assertIn("no-new-privileges", command)
        self.assertIn("ALL", command)
        self.assertIn("test-image", command)


if __name__ == "__main__":
    unittest.main()
