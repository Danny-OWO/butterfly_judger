const JUDGE_URL = "https://ce.judge0.com";
const $ = (selector) => document.querySelector(selector);

const elements = {
  banner: $("#connection-banner"),
  unitListView: $("#unit-list-view"),
  unitList: $("#unit-list"),
  problemListView: $("#problem-list-view"),
  problemList: $("#problem-list"),
  problemCount: $("#problem-count"),
  problemView: $("#problem-view"),
  unitBackButton: $("#unit-back-button"),
  problemBackButton: $("#problem-back-button"),
  codeEditor: $("#code-editor"),
  submitButton: $("#submit-button"),
  resultPanel: $("#result-panel"),
  publicTests: $("#public-tests"),
};

let currentUnit = null;
let currentProblem = null;
let highlightedEditor = null;
let running = false;

function initializeEditor() {
  if (!window.CodeMirror) return;
  highlightedEditor = window.CodeMirror.fromTextArea(elements.codeEditor, {
    mode: "text/x-c++src",
    theme: "butterfly",
    lineNumbers: true,
    indentUnit: 4,
    tabSize: 4,
    indentWithTabs: false,
    lineWrapping: false,
    extraKeys: {
      Tab(editor) {
        if (editor.somethingSelected()) editor.indentSelection("add");
        else editor.replaceSelection("    ", "end", "+input");
      },
      "Shift-Tab": "indentLess",
    },
  });
}

function setEditorValue(value) {
  if (highlightedEditor) {
    highlightedEditor.setValue(value);
    requestAnimationFrame(() => highlightedEditor.refresh());
  } else elements.codeEditor.value = value;
}

function getEditorValue() {
  return highlightedEditor ? highlightedEditor.getValue() : elements.codeEditor.value;
}

function showOnly(view) {
  for (const candidate of [elements.unitListView, elements.problemListView, elements.problemView]) {
    candidate.hidden = candidate !== view;
  }
}

function updateRoute(parameters = {}) {
  const query = new URLSearchParams(parameters);
  history.pushState(null, "", query.size ? `?${query}` : location.pathname);
}

function createUnitCard(unit) {
  const count = COURSE_PROBLEMS.filter((problem) => problem.unit === unit.id).length;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "unit-card";
  button.innerHTML = `<span class="unit-number">${String(unit.id).padStart(2, "0")}</span><span class="unit-card-content"><strong>第 ${unit.id} 單元</strong><small>${unit.title} · ${count} 題</small></span><span class="card-arrow" aria-hidden="true">→</span>`;
  button.addEventListener("click", () => openUnit(unit.id));
  return button;
}

function renderUnits() {
  elements.unitList.replaceChildren(...COURSE_UNITS.map(createUnitCard));
}

function openUnits(updateHistory = true) {
  currentUnit = null;
  currentProblem = null;
  showOnly(elements.unitListView);
  if (updateHistory) updateRoute();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function createProblemListItem(problem) {
  const item = document.createElement("li");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "problem-list-item";
  button.innerHTML = `<span class="problem-list-id">${problem.id}</span><span class="problem-list-title">${escapeHtml(problem.title)}</span><span class="card-arrow" aria-hidden="true">→</span>`;
  button.addEventListener("click", () => openProblem(problem.id));
  item.append(button);
  return item;
}

function openUnit(unitId, updateHistory = true) {
  const unit = COURSE_UNITS.find((item) => item.id === unitId);
  if (!unit) return;
  currentUnit = unitId;
  currentProblem = null;
  const problems = COURSE_PROBLEMS.filter((problem) => problem.unit === unitId);
  $("#problem-list-title").textContent = `第 ${unitId} 單元 · ${unit.title}`;
  elements.problemCount.textContent = `${problems.length} 題`;
  elements.problemList.replaceChildren(...problems.map(createProblemListItem));
  showOnly(elements.problemListView);
  if (updateHistory) updateRoute({ unit: unitId });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function createCodeBlock(label, content) {
  const wrapper = document.createElement("div");
  wrapper.className = "case-block";
  const title = document.createElement("span");
  title.textContent = label;
  const pre = document.createElement("pre");
  pre.textContent = content || "（空白）";
  wrapper.append(title, pre);
  return wrapper;
}

function renderPublicTests(problem) {
  elements.publicTests.replaceChildren();
  problem.tests.forEach((test, index) => {
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = `測資 ${index + 1}`;
    details.append(summary, createCodeBlock("輸入", test.input), createCodeBlock("預期輸出", test.output));
    elements.publicTests.append(details);
  });
}

function openProblem(problemId, updateHistory = true) {
  const problem = COURSE_PROBLEMS.find((item) => item.id === problemId);
  if (!problem) return;
  currentProblem = problem;
  currentUnit = problem.unit;
  $("#problem-id").textContent = problem.id;
  $("#problem-title").textContent = problem.title;
  $("#source-link").href = problem.sourceUrl;
  $("#sample-input").textContent = problem.sampleInput || "（空白）";
  $("#sample-output").textContent = problem.sampleOutput || "（空白）";
  renderPublicTests(problem);
  setEditorValue("");
  elements.resultPanel.hidden = true;
  showOnly(elements.problemView);
  if (updateHistory) updateRoute({ unit: problem.unit, problem: problem.id });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function normalize(value) {
  return String(value ?? "").replace(/\r\n/g, "\n").trimEnd();
}

function encodeBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeBase64(text) {
  if (!text) return "";
  const binary = atob(text);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

async function responseJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.message || `HTTP ${response.status}`);
  return data;
}

async function execute(code, stdin) {
  const created = await responseJson(await fetch(`${JUDGE_URL}/submissions?base64_encoded=true&wait=false`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ language_id: 54, source_code: encodeBase64(code), stdin: encodeBase64(stdin), cpu_time_limit: 2, wall_time_limit: 5 }),
  }));
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, attempt < 2 ? 650 : 1000));
    const result = await responseJson(await fetch(`${JUDGE_URL}/submissions/${created.token}?base64_encoded=true&fields=stdout,stderr,compile_output,message,time,status`));
    if (result.status?.id > 2) {
      return { ...result, stdout: decodeBase64(result.stdout), stderr: decodeBase64(result.stderr), compile_output: decodeBase64(result.compile_output), message: decodeBase64(result.message) };
    }
  }
  throw new Error("判題逾時");
}

function verdict(result, expected) {
  if (result.status?.id === 6) return { status: "CE", error: result.compile_output || result.stderr || "編譯失敗" };
  if (result.status?.id === 5) return { status: "TLE", error: "執行時間超過限制" };
  if (result.status?.id !== 3) return { status: "RE", error: result.stderr || result.message || "執行錯誤" };
  if (normalize(result.stdout) !== normalize(expected)) return { status: "WA", error: `預期輸出：\n${normalize(expected)}\n\n你的輸出：\n${normalize(result.stdout)}` };
  return { status: "AC", error: "" };
}

function renderResults(rows, total) {
  const accepted = rows.length === total && rows.every((row) => row.status === "AC");
  const passed = rows.filter((row) => row.status === "AC").length;
  elements.resultPanel.className = `result-panel ${accepted ? "ac" : "failed"}`;
  elements.resultPanel.innerHTML = `<div class="result-title">${accepted ? "AC" : rows.at(-1)?.status || "錯誤"} · ${passed}/${total}</div>${rows.map((row) => `<div class="test-row"><span>測資 ${row.index}</span><span>${row.status}</span></div>`).join("")}${rows.at(-1)?.error ? `<pre>${escapeHtml(rows.at(-1).error)}</pre>` : ""}`;
  elements.resultPanel.hidden = false;
}

async function submitCode() {
  if (running || !currentProblem) return;
  const code = getEditorValue().trim();
  if (!code) {
    elements.banner.textContent = "請先輸入 C++ 程式碼。";
    elements.banner.hidden = false;
    return;
  }
  running = true;
  elements.banner.hidden = true;
  elements.submitButton.disabled = true;
  elements.submitButton.textContent = "判題中…";
  const rows = [];
  try {
    for (let index = 0; index < currentProblem.tests.length; index += 1) {
      const result = await execute(code, currentProblem.tests[index].input);
      const judged = verdict(result, currentProblem.tests[index].output);
      rows.push({ index: index + 1, ...judged });
      if (judged.status !== "AC") break;
    }
    renderResults(rows, currentProblem.tests.length);
  } catch (error) {
    elements.banner.textContent = `判題服務錯誤：${error.message}`;
    elements.banner.hidden = false;
  } finally {
    running = false;
    elements.submitButton.disabled = false;
    elements.submitButton.textContent = "送出";
  }
}

function routeFromUrl() {
  const parameters = new URLSearchParams(location.search);
  const problemId = parameters.get("problem");
  const unitId = Number(parameters.get("unit"));
  if (problemId) openProblem(problemId, false);
  else if (unitId >= 1 && unitId <= 11) openUnit(unitId, false);
  else openUnits(false);
}

elements.unitBackButton.addEventListener("click", () => openUnits());
elements.problemBackButton.addEventListener("click", () => openUnit(currentUnit));
elements.submitButton.addEventListener("click", submitCode);
window.addEventListener("popstate", routeFromUrl);

initializeEditor();
renderUnits();
routeFromUrl();
