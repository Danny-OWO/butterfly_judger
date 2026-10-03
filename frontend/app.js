const HISTORY_KEY = "butterfly-browser-submissions";
const PYODIDE_LOAD_TIMEOUT_MS = 120_000;

const elements = {
  banner: document.querySelector("#connection-banner"),
  catalogListView: document.querySelector("#catalog-list-view"),
  tqcCatalogButton: document.querySelector("#tqc-catalog-button"),
  unitListView: document.querySelector("#unit-list-view"),
  unitList: document.querySelector("#unit-list"),
  problemListView: document.querySelector("#problem-list-view"),
  problemList: document.querySelector("#problem-list"),
  problemCount: document.querySelector("#problem-count"),
  problemView: document.querySelector("#problem-view"),
  catalogBackButton: document.querySelector("#catalog-back-button"),
  unitBackButton: document.querySelector("#unit-back-button"),
  problemBackButton: document.querySelector("#problem-back-button"),
  submitButton: document.querySelector("#submit-button"),
  codeEditor: document.querySelector("#code-editor"),
  resultPanel: document.querySelector("#result-panel"),
  publicTests: document.querySelector("#public-tests"),
};

const TQC_UNITS = [
  { id: 1, name: "基本程式設計", accent: "01" },
  { id: 2, name: "選擇敘述", accent: "02" },
  { id: 3, name: "迴圈敘述", accent: "03" },
  { id: 4, name: "進階控制流程", accent: "04" },
  { id: 5, name: "函式 Function", accent: "05" },
  { id: 6, name: "串列 List", accent: "06" },
  { id: 7, name: "數組、集合與詞典", accent: "07" },
  { id: 8, name: "字串 String", accent: "08" },
  { id: 9, name: "檔案與異常處理", accent: "09" },
];

let problems = [];
let currentProblem = null;
let currentUnit = null;
let worker = null;
let workerReady = null;
let highlightedEditor = null;

function initializeEditor() {
  if (!window.CodeMirror) return;
  highlightedEditor = window.CodeMirror.fromTextArea(elements.codeEditor, {
    mode: { name: "python", version: 3 },
    theme: "butterfly",
    lineNumbers: true,
    indentUnit: 4,
    tabSize: 4,
    indentWithTabs: false,
    lineWrapping: false,
    extraKeys: {
      Tab(editor) {
        if (editor.somethingSelected()) {
          editor.indentSelection("add");
        } else {
          editor.replaceSelection("    ", "end", "+input");
        }
      },
      "Shift-Tab": "indentLess",
    },
  });
}

function setEditorValue(value) {
  if (highlightedEditor) {
    highlightedEditor.setValue(value);
    window.requestAnimationFrame(() => highlightedEditor.refresh());
  } else {
    elements.codeEditor.value = value;
  }
}

function getEditorValue() {
  return highlightedEditor ? highlightedEditor.getValue() : elements.codeEditor.value;
}

function showBanner(message, tone = "error") {
  elements.banner.textContent = message;
  elements.banner.className = `banner ${tone}`;
  elements.banner.hidden = false;
}

function clearBanner() {
  elements.banner.hidden = true;
  elements.banner.textContent = "";
}

function showOnly(view) {
  for (const candidate of [
    elements.catalogListView,
    elements.unitListView,
    elements.problemListView,
    elements.problemView,
  ]) {
    candidate.hidden = candidate !== view;
  }
}

function updateRoute(parameters) {
  const query = new URLSearchParams(parameters);
  const suffix = query.size ? `?${query}` : "";
  history.pushState(null, "", `${window.location.pathname}${suffix}`);
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openHome(updateHistory = true) {
  currentProblem = null;
  currentUnit = null;
  clearBanner();
  showOnly(elements.catalogListView);
  if (updateHistory) updateRoute({});
  scrollToTop();
}

function openCatalog(updateHistory = true) {
  currentProblem = null;
  currentUnit = null;
  clearBanner();
  showOnly(elements.unitListView);
  if (updateHistory) updateRoute({ catalog: "tqc" });
  scrollToTop();
}

function createUnitCard(unit) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "unit-card";
  const number = document.createElement("span");
  number.className = "unit-number";
  number.textContent = unit.accent;
  const content = document.createElement("span");
  content.className = "unit-card-content";
  const title = document.createElement("strong");
  title.textContent = `第 ${unit.id} 類`;
  const name = document.createElement("small");
  name.textContent = unit.name;
  content.append(title, name);
  const arrow = document.createElement("span");
  arrow.className = "card-arrow";
  arrow.setAttribute("aria-hidden", "true");
  arrow.textContent = "→";
  button.append(number, content, arrow);
  button.addEventListener("click", () => openUnit(unit.id));
  return button;
}

function createProblemListItem(problem) {
  const item = document.createElement("li");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "problem-list-item";
  const id = document.createElement("span");
  id.className = "problem-list-id";
  id.textContent = problem.id;
  const title = document.createElement("span");
  title.className = "problem-list-title";
  title.textContent = problem.title;
  const arrow = document.createElement("span");
  arrow.className = "card-arrow";
  arrow.setAttribute("aria-hidden", "true");
  arrow.textContent = "→";
  button.append(id, title, arrow);
  button.addEventListener("click", () => openProblem(problem.id));
  item.append(button);
  return item;
}

async function loadProblems() {
  elements.unitList.replaceChildren(...TQC_UNITS.map(createUnitCard));
  try {
    const response = await fetch("problems.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    problems = await response.json();
    clearBanner();
    routeFromUrl();
  } catch (error) {
    showBanner(`無法載入題庫：${error.message}`);
  }
}

function openUnit(unitId, updateHistory = true) {
  const unit = TQC_UNITS.find((item) => item.id === Number(unitId));
  if (!unit) {
    showBanner(`找不到 TQC 第 ${unitId} 類`);
    return;
  }
  const unitProblems = problems.filter(
    (problem) => Math.floor(Number(problem.id) / 100) === unit.id
  );
  clearBanner();
  currentProblem = null;
  currentUnit = unit.id;
  document.querySelector("#problem-list-title").textContent = `第 ${unit.id} 類 · ${unit.name}`;
  elements.problemCount.textContent = `${unitProblems.length} 題`;
  elements.problemList.replaceChildren(...unitProblems.map(createProblemListItem));
  showOnly(elements.problemListView);
  if (updateHistory) updateRoute({ catalog: "tqc", unit: unit.id });
  scrollToTop();
}

function setText(selector, value) {
  document.querySelector(selector).textContent = value || "—";
}

function createCodeBlock(label, content) {
  const wrapper = document.createElement("div");
  wrapper.className = "case-block";
  const title = document.createElement("span");
  title.textContent = label;
  const pre = document.createElement("pre");
  pre.textContent = content;
  wrapper.append(title, pre);
  return wrapper;
}

function renderPublicTests(problem) {
  elements.publicTests.replaceChildren();
  for (const [index, test] of problem.tests.entries()) {
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = `測資 ${index + 1}：${test.name}`;
    details.append(summary);
    if (Object.keys(test.files || {}).length) {
      const heading = document.createElement("h4");
      heading.textContent = "執行前檔案";
      details.append(heading);
      for (const [filename, content] of Object.entries(test.files)) {
        details.append(createCodeBlock(filename, content));
      }
    }
    details.append(createCodeBlock("輸入", test.input || "（空）"));
    details.append(createCodeBlock("預期輸出", test.expected_output || "（空）"));
    if (Object.keys(test.expected_files || {}).length) {
      const heading = document.createElement("h4");
      heading.textContent = "執行後預期檔案";
      details.append(heading);
      for (const [filename, content] of Object.entries(test.expected_files)) {
        details.append(createCodeBlock(filename, content));
      }
    }
    elements.publicTests.append(details);
  }
}

function openProblem(problemId, updateHistory = true) {
  const problem = problems.find((item) => item.id === problemId);
  if (!problem) {
    showBanner(`找不到題目 ${problemId}`);
    return;
  }
  clearBanner();
  currentProblem = problem;
  currentUnit = Math.floor(Number(problem.id) / 100);
  setText("#problem-id", problem.id);
  setText("#problem-title", problem.title);
  setText("#problem-description", problem.description);
  setText("#problem-input", problem.input);
  setText("#problem-output", problem.output);
  setText("#sample-input", problem.sample_input || "（空）");
  setText("#sample-output", problem.sample_output || "（空）");
  setText("#limits", `${problem.time_limit}s`);
  renderPublicTests(problem);
  setEditorValue("");
  elements.resultPanel.hidden = true;
  showOnly(elements.problemView);
  if (updateHistory) {
    updateRoute({ catalog: "tqc", unit: currentUnit, problem: problem.id });
  }
  scrollToTop();
}

function resetWorker() {
  if (worker) worker.terminate();
  worker = null;
  workerReady = null;
}

function ensureWorker() {
  if (worker && workerReady) return workerReady;
  worker = new Worker("pyodide-worker.mjs", { type: "module" });
  workerReady = new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      resetWorker();
      reject(new Error("Python 執行環境載入逾時，請檢查網路後重試。"));
    }, PYODIDE_LOAD_TIMEOUT_MS);
    const onMessage = (event) => {
      if (event.data.type === "ready") {
        window.clearTimeout(timeout);
        worker.removeEventListener("message", onMessage);
        resolve(worker);
      } else if (event.data.type === "status") {
        showBanner(event.data.message, "info");
      } else if (event.data.type === "load-error") {
        window.clearTimeout(timeout);
        worker.removeEventListener("message", onMessage);
        resetWorker();
        reject(new Error(event.data.message));
      }
    };
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", (event) => {
      window.clearTimeout(timeout);
      reject(new Error(event.message || "Pyodide Worker 載入失敗"));
    }, { once: true });
  });
  return workerReady;
}

async function judgeInBrowser(problem, code) {
  const activeWorker = await ensureWorker();
  return new Promise((resolve, reject) => {
    const results = [];
    let timer = null;
    let activeTest = null;
    const cleanup = () => {
      if (timer) window.clearTimeout(timer);
      activeWorker.removeEventListener("message", onMessage);
      activeWorker.removeEventListener("error", onError);
    };
    const startTimer = (test) => {
      activeTest = test;
      timer = window.setTimeout(() => {
        cleanup();
        resetWorker();
        results.push({
          name: test.name,
          status: "TLE",
          runtime_ms: Math.round(problem.time_limit * 1000),
          input: test.input,
          expected: test.expected_output,
          actual: "",
          error: `超過 ${problem.time_limit} 秒限制`,
        });
        resolve(results);
      }, problem.time_limit * 1000);
    };
    const onMessage = (event) => {
      const message = event.data;
      if (message.type === "test-start") {
        startTimer(message.test);
      } else if (message.type === "test-result") {
        if (timer) window.clearTimeout(timer);
        timer = null;
        results.push(message.result);
      } else if (message.type === "done") {
        cleanup();
        resolve(results);
      }
    };
    const onError = (event) => {
      cleanup();
      resetWorker();
      reject(new Error(event.message || `測資 ${activeTest?.name || "未知"} 執行失敗`));
    };
    activeWorker.addEventListener("message", onMessage);
    activeWorker.addEventListener("error", onError);
    activeWorker.postMessage({ type: "judge", code, tests: problem.tests });
  });
}

function overallStatus(results, total) {
  if (results.length < total && results.at(-1)?.status === "TLE") return "TLE";
  return results.find((result) => result.status !== "AC")?.status || "AC";
}

function renderResult(results, total) {
  const status = overallStatus(results, total);
  const passed = results.filter((result) => result.status === "AC").length;
  elements.resultPanel.replaceChildren();
  elements.resultPanel.className = `result-panel ${status === "AC" ? "ac" : "failed"}`;
  const title = document.createElement("div");
  title.className = "result-title";
  title.textContent = `${status} · ${passed}/${total}`;
  elements.resultPanel.append(title);
  for (const result of results) {
    const details = document.createElement("details");
    details.open = result.status !== "AC";
    const summary = document.createElement("summary");
    summary.textContent = `${result.name}: ${result.status} (${result.runtime_ms} ms)`;
    details.append(summary);
    details.append(createCodeBlock("輸入", result.input || "（空）"));
    details.append(createCodeBlock("預期", result.expected || "（空）"));
    details.append(createCodeBlock("實際", result.actual || "（空）"));
    if (result.error) details.append(createCodeBlock("錯誤", result.error));
    if (result.file_failures?.length) {
      details.append(createCodeBlock("File check", result.file_failures.join("\n")));
    }
    elements.resultPanel.append(details);
  }
  elements.resultPanel.hidden = false;
  return { status, passed };
}

function saveHistory(problem, code, summary) {
  let saved = [];
  try {
    saved = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch (_) {
    saved = [];
  }
  saved.unshift({
    problem_id: problem.id,
    code,
    status: summary.status,
    passed: summary.passed,
    total: problem.tests.length,
    submitted_at: new Date().toISOString(),
  });
  localStorage.setItem(HISTORY_KEY, JSON.stringify(saved.slice(0, 50)));
}

async function submitCode() {
  if (!currentProblem) return;
  const code = getEditorValue();
  elements.submitButton.disabled = true;
  elements.submitButton.textContent = workerReady ? "判題中…" : "載入…";
  clearBanner();
  try {
    const results = await judgeInBrowser(currentProblem, code);
    clearBanner();
    const summary = renderResult(results, currentProblem.tests.length);
    saveHistory(currentProblem, code, summary);
  } catch (error) {
    showBanner(`判題失敗：${error.message}`);
  } finally {
    elements.submitButton.disabled = false;
    elements.submitButton.textContent = "送出";
  }
}

function routeFromUrl() {
  const parameters = new URLSearchParams(window.location.search);
  const problemId = parameters.get("problem");
  const unitId = Number(parameters.get("unit"));
  if (problemId) {
    openProblem(problemId, false);
  } else if (unitId >= 1 && unitId <= 9) {
    openUnit(unitId, false);
  } else if (parameters.get("catalog") === "tqc") {
    openCatalog(false);
  } else {
    openHome(false);
  }
}

elements.tqcCatalogButton.addEventListener("click", () => openCatalog());
elements.catalogBackButton.addEventListener("click", () => openHome());
elements.unitBackButton.addEventListener("click", () => openCatalog());
elements.problemBackButton.addEventListener("click", () => openUnit(currentUnit));
window.addEventListener("popstate", routeFromUrl);

elements.submitButton.addEventListener("click", submitCode);
elements.codeEditor.addEventListener("keydown", (event) => {
  if (event.key !== "Tab") return;
  event.preventDefault();
  const start = elements.codeEditor.selectionStart;
  const end = elements.codeEditor.selectionEnd;
  elements.codeEditor.setRangeText("    ", start, end, "end");
});

initializeEditor();
loadProblems();
