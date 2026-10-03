import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync("dist/index.html", "utf8");
const css = fs.readFileSync("dist/style.css", "utf8");
const source = fs.readFileSync("dist/problems.js", "utf8");
const context = { window: {} };
vm.createContext(context);
vm.runInContext(source, context);

const { COURSE_UNITS: units, COURSE_PROBLEMS: problems } = context.window;
const requiredProblemFields = [
  "id", "unit", "title", "statement", "input", "output", "sampleInput",
  "sampleOutput", "hint", "starter", "tests",
];

if (units.length !== 11) throw new Error(`Expected 11 units, found ${units.length}`);
if (problems.length !== 22) throw new Error(`Expected 22 problems, found ${problems.length}`);
if (new Set(problems.map((problem) => problem.id)).size !== problems.length) {
  throw new Error("Problem IDs must be unique");
}

for (const unit of units) {
  const count = problems.filter((problem) => problem.unit === unit.id).length;
  if (count !== 2) throw new Error(`Unit ${unit.id} has ${count} problems instead of 2`);
}

for (const problem of problems) {
  for (const field of requiredProblemFields) {
    if (problem[field] === undefined || problem[field] === "") {
      throw new Error(`${problem.id} is missing ${field}`);
    }
  }
  if (problem.tests.length < 3) throw new Error(`${problem.id} needs at least 3 tests`);
  if (!problem.starter.includes("int main()")) throw new Error(`${problem.id} has no C++ main`);
}

for (const id of ["unit-nav", "problem-grid", "code-editor", "run-button", "submit-button", "result-panel"]) {
  if (!html.includes(`id="${id}"`)) throw new Error(`Missing HTML target #${id}`);
}
if (!css.includes("@media(max-width:620px)")) throw new Error("Missing mobile breakpoint");

console.log(`Verified ${units.length} units, ${problems.length} problems, ${problems.reduce((n, p) => n + p.tests.length, 0)} tests.`);
