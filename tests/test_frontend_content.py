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

    def test_contains_all_nine_units(self) -> None:
        self.assertEqual(
            [problem["id"] for problem in self.problems],
            [
                str(unit * 100 + number)
                for unit in range(1, 10)
                for number in range(1, 11)
            ],
        )

    def test_unit_problem_list_only_renders_problem_id_and_title(self) -> None:
        javascript = (FRONTEND / "app.js").read_text(encoding="utf-8")
        list_renderer = javascript.split("function createProblemListItem", 1)[1].split(
            "async function loadProblems", 1
        )[0]
        self.assertIn("problem.id", list_renderer)
        self.assertIn("problem.title", list_renderer)
        self.assertNotIn("problem.description", list_renderer)

    def test_catalog_navigation_has_nine_tqc_units(self) -> None:
        javascript = (FRONTEND / "app.js").read_text(encoding="utf-8")
        html = (FRONTEND / "index.html").read_text(encoding="utf-8")
        self.assertIn('id="catalog-list-view"', html)
        self.assertIn('id="unit-list-view"', html)
        self.assertIn('id="problem-list-view"', html)
        unit_definitions = javascript.split("const TQC_UNITS = [", 1)[1].split(
            "];", 1
        )[0]
        self.assertEqual(unit_definitions.count("{ id:"), 9)
        self.assertIn('updateRoute({ catalog: "tqc", unit: unit.id })', javascript)

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

    def test_browser_judge_uses_strict_output_comparison(self) -> None:
        worker = (FRONTEND / "pyodide-worker.mjs").read_text(encoding="utf-8")
        self.assertNotIn("normalizeOutput", worker)
        self.assertIn("execution.stdout === (test.expected_output", worker)
        self.assertIn("actual !== expected", worker)

    def test_python_editor_has_syntax_highlighting(self) -> None:
        html = (FRONTEND / "index.html").read_text(encoding="utf-8")
        javascript = (FRONTEND / "app.js").read_text(encoding="utf-8")
        css = (FRONTEND / "style.css").read_text(encoding="utf-8")
        self.assertIn("codemirror@5.65.21", html)
        self.assertIn('mode: { name: "python", version: 3 }', javascript)
        self.assertIn("highlightedEditor.getValue()", javascript)
        self.assertIn(".cm-s-butterfly .cm-keyword", css)


if __name__ == "__main__":
    unittest.main()
