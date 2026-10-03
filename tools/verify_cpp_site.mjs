import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync("dist/index.html", "utf8");
const css = fs.readFileSync("dist/style.css", "utf8");
const app = fs.readFileSync("dist/app.js", "utf8");
const source = fs.readFileSync("dist/problems.js", "utf8");
const portal = fs.readFileSync("portal/index.html", "utf8");
const tqc = fs.readFileSync("frontend/index.html", "utf8");
const context = { window: {} };
vm.createContext(context);
vm.runInContext(source, context);

const { COURSE_UNITS: units, COURSE_PROBLEMS: problems } = context.window;
const requiredProblemFields = [
  "id", "unit", "title", "statement", "input", "output", "sampleInput",
  "sampleOutput", "hint", "starter", "tests", "sourceUrl",
];

if (units.length !== 11) throw new Error(`Expected 11 units, found ${units.length}`);
if (problems.length !== 112) throw new Error(`Expected 112 problems, found ${problems.length}`);
if (new Set(problems.map((problem) => problem.id)).size !== problems.length) {
  throw new Error("Problem IDs must be unique");
}

const expectedCounts = [9, 10, 12, 10, 12, 16, 13, 6, 8, 8, 8];
for (const unit of units) {
  const count = problems.filter((problem) => problem.unit === unit.id).length;
  if (count !== expectedCounts[unit.id - 1]) {
    throw new Error(`Unit ${unit.id} has ${count} problems instead of ${expectedCounts[unit.id - 1]}`);
  }
}

for (const problem of problems) {
  for (const field of requiredProblemFields) {
    if (problem[field] === undefined || problem[field] === "") {
      throw new Error(`${problem.id} is missing ${field}`);
    }
  }
  if (problem.tests.length < 3) throw new Error(`${problem.id} needs at least 3 tests`);
}

for (const id of ["unit-list", "problem-list", "source-link", "code-editor", "submit-button", "result-panel"]) {
  if (!html.includes(`id="${id}"`)) throw new Error(`Missing HTML target #${id}`);
}
if (!css.includes("@media (max-width: 820px)")) throw new Error("Missing mobile breakpoint");
if (!html.includes("mode/clike/clike.min.js") || !app.includes('mode: "text/x-c++src"')) {
  throw new Error("Missing C++ syntax highlighting");
}
if (html.includes("progress-label") || html.includes("C++ Judger")) {
  throw new Error("C++ page must use shared branding without progress chrome");
}
if (!/<textarea[^>]+id="code-editor"[^>]*><\/textarea>/.test(html)) {
  throw new Error("C++ editor must start empty");
}
if (!portal.includes('href="./tqc/"') || !portal.includes('href="./snakify-cpp/"')) {
  throw new Error("Portal must link to both problem libraries");
}
if (!tqc.includes('href="../">題庫首頁</a>') || !html.includes("題庫首頁")) {
  throw new Error("Both problem libraries must link back to the portal");
}

console.log(`Verified shared design, empty highlighted C++ editor, ${units.length} units, ${problems.length} problems, and ${problems.reduce((n, p) => n + p.tests.length, 0)} tests.`);
