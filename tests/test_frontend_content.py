from __future__ import annotations

import json
import re
import unittest
from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend"


class IdParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.ids: set[str] = set()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        del tag
        for name, value in attrs:
            if name == "id" and value:
                self.ids.add(value)


class FrontendContentTests(unittest.TestCase):
    def setUp(self) -> None:
        self.problems = json.loads(
            (FRONTEND / "problems.json").read_text(encoding="utf-8")
        )

    def test_contains_complete_901_to_910_set(self) -> None:
        self.assertEqual(
            [problem["id"] for problem in self.problems],
            [str(number) for number in range(901, 911)],
        )

    def test_every_problem_has_public_tests_and_no_solution_field(self) -> None:
        forbidden = {"answer", "solution", "reference_code"}
        for problem in self.problems:
            self.assertTrue(problem["tests"], problem["id"])
            self.assertTrue(forbidden.isdisjoint(problem), problem["id"])
            self.assertTrue(problem["source"].startswith("https://hackmd.io/"))
            for test in problem["tests"]:
                self.assertIn("input", test)
                self.assertIn("expected_output", test)
                self.assertIn("files", test)
                self.assertIn("expected_files", test)

    def test_javascript_selectors_exist_in_html(self) -> None:
        javascript = (FRONTEND / "app.js").read_text(encoding="utf-8")
        html = (FRONTEND / "index.html").read_text(encoding="utf-8")
        parser = IdParser()
        parser.feed(html)
        selectors = set(re.findall(r'querySelector\("#([^\"]+)', javascript))
        self.assertEqual(selectors - parser.ids, set())

    def test_required_static_assets_exist(self) -> None:
        for filename in (
            "index.html",
            "style.css",
            "app.js",
            "pyodide-worker.mjs",
            "problems.json",
            ".nojekyll",
        ):
            self.assertTrue((FRONTEND / filename).exists(), filename)


if __name__ == "__main__":
    unittest.main()
