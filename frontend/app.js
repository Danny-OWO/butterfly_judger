const DEFAULT_API_URL = "http://127.0.0.1:8000";
const API_STORAGE_KEY = "butterfly-api-url";

const elements = {
  banner: document.querySelector("#connection-banner"),
  problemListView: document.querySelector("#problem-list-view"),
  problemList: document.querySelector("#problem-list"),
  problemCount: document.querySelector("#problem-count"),
  problemView: document.querySelector("#problem-view"),
  backButton: document.querySelector("#back-button"),
  settingsButton: document.querySelector("#settings-button"),
  settingsDialog: document.querySelector("#settings-dialog"),
  settingsForm: document.querySelector("#settings-form"),
  apiUrl: document.querySelector("#api-url"),
  submitButton: document.querySelector("#submit-button"),
  codeEditor: document.querySelector("#code-editor"),
  resultPanel: document.querySelector("#result-panel"),
};

let currentProblem = null;

function apiBaseUrl() {
  return (localStorage.getItem(API_STORAGE_KEY) || DEFAULT_API_URL).replace(/\/$/, "");
}

async function api(path, options = {}) {
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      message = body.detail || message;
    } catch (_) {
      // A non-JSON server error still has a useful HTTP status.
    }
    throw new Error(message);
  }
  return response.json();
}

function showBanner(message) {
  elements.banner.textContent = message;
  elements.banner.hidden = false;
}

function clearBanner() {
  elements.banner.hidden = true;
  elements.banner.textContent = "";
}

function createProblemCard(problem) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "problem-card";

  const id = document.createElement("span");
  id.className = "eyebrow";
  id.textContent = `PROBLEM ${problem.id}`;
  const title = document.createElement("h3");
  title.textContent = problem.title;
  const description = document.createElement("p");
  description.textContent = problem.description;

  button.append(id, title, description);
  button.addEventListener("click", () => openProblem(problem.id));
  return button;
}

async function loadProblems() {
  elements.problemList.replaceChildren();
  elements.problemCount.textContent = "載入中";
  try {
    const problems = await api("/api/problems");
    clearBanner();
    elements.problemCount.textContent = `${problems.length} 題`;
    if (!problems.length) {
      elements.problemList.textContent = "目前還沒有公開題目。";
      return;
    }
    elements.problemList.append(...problems.map(createProblemCard));
  } catch (error) {
    elements.problemCount.textContent = "連線失敗";
    showBanner(`無法連接 API（${apiBaseUrl()}）：${error.message}`);
  }
}

function setText(selector, value) {
  document.querySelector(selector).textContent = value || "—";
}

async function openProblem(problemId) {
  try {
    const problem = await api(`/api/problems/${encodeURIComponent(problemId)}`);
    clearBanner();
    currentProblem = problem;
    setText("#problem-id", `PROBLEM ${problem.id}`);
    setText("#problem-title", problem.title);
    setText("#problem-description", problem.description);
    setText("#problem-input", problem.input);
    setText("#problem-output", problem.output);
    setText("#sample-input", problem.sample_input);
    setText("#sample-output", problem.sample_output);
    setText("#limits", `${problem.time_limit}s · ${problem.memory_limit} MB`);
    elements.codeEditor.value = "a, b = map(int, input().split())\nprint(a + b)\n";
    elements.resultPanel.hidden = true;
    elements.problemListView.hidden = true;
    elements.problemView.hidden = false;
    history.replaceState(null, "", `?problem=${encodeURIComponent(problem.id)}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    showBanner(`無法讀取題目：${error.message}`);
  }
}

function renderResult(result) {
  elements.resultPanel.replaceChildren();
  elements.resultPanel.className = `result-panel ${result.status === "AC" ? "ac" : "failed"}`;

  const title = document.createElement("div");
  title.className = "result-title";
  title.textContent = `${result.status} · ${result.passed}/${result.total}`;
  const tests = document.createElement("div");
  tests.className = "test-list";
  for (const test of result.tests) {
    const row = document.createElement("span");
    row.textContent = `Test ${test.name}: ${test.status} (${test.runtime_ms} ms)`;
    tests.append(row);
  }
  elements.resultPanel.append(title, tests);
  if (result.error) {
    const error = document.createElement("pre");
    error.textContent = result.error;
    elements.resultPanel.append(error);
  }
  elements.resultPanel.hidden = false;
}

async function submitCode() {
  if (!currentProblem) return;
  elements.submitButton.disabled = true;
  elements.submitButton.textContent = "判題中…";
  try {
    const result = await api("/api/submissions", {
      method: "POST",
      body: JSON.stringify({ problem_id: currentProblem.id, code: elements.codeEditor.value }),
    });
    clearBanner();
    renderResult(result);
  } catch (error) {
    showBanner(`送出失敗：${error.message}`);
  } finally {
    elements.submitButton.disabled = false;
    elements.submitButton.textContent = "送出判題";
  }
}

elements.backButton.addEventListener("click", () => {
  currentProblem = null;
  elements.problemView.hidden = true;
  elements.problemListView.hidden = false;
  history.replaceState(null, "", window.location.pathname);
});

elements.settingsButton.addEventListener("click", () => {
  elements.apiUrl.value = apiBaseUrl();
  elements.settingsDialog.showModal();
});

elements.settingsForm.addEventListener("submit", (event) => {
  if (event.submitter?.value !== "save") return;
  event.preventDefault();
  localStorage.setItem(API_STORAGE_KEY, elements.apiUrl.value.trim().replace(/\/$/, ""));
  elements.settingsDialog.close();
  loadProblems();
});

elements.submitButton.addEventListener("click", submitCode);
elements.codeEditor.addEventListener("keydown", (event) => {
  if (event.key !== "Tab") return;
  event.preventDefault();
  const start = elements.codeEditor.selectionStart;
  const end = elements.codeEditor.selectionEnd;
  elements.codeEditor.setRangeText("    ", start, end, "end");
});

loadProblems().then(() => {
  const requestedProblem = new URLSearchParams(window.location.search).get("problem");
  if (requestedProblem) openProblem(requestedProblem);
});
