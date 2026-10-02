const HISTORY_KEY = "butterfly-browser-submissions";
const PYODIDE_LOAD_TIMEOUT_MS = 120_000;

const elements = {
  banner: document.querySelector("#connection-banner"),
  problemListView: document.querySelector("#problem-list-view"),
  problemList: document.querySelector("#problem-list"),
  problemCount: document.querySelector("#problem-count"),
  problemView: document.querySelector("#problem-view"),
  backButton: document.querySelector("#back-button"),
  submitButton: document.querySelector("#submit-button"),
  codeEditor: document.querySelector("#code-editor"),
  resultPanel: document.querySelector("#result-panel"),
  publicTests: document.querySelector("#public-tests"),
  sourceLink: document.querySelector("#source-link"),
};

let problems = [];
let currentProblem = null;
let worker = null;
let workerReady = null;

function showBanner(message, tone = "error") {
  elements.banner.textContent = message;
  elements.banner.className = `banner ${tone}`;
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
    const response = await fetch("problems.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    problems = await response.json();
    clearBanner();
    elements.problemCount.textContent = `${problems.length} 題`;
    elements.problemList.append(...problems.map(createProblemCard));
  } catch (error) {
    elements.problemCount.textContent = "載入失敗";
    showBanner(`無法載入題庫：${error.message}`);
  }
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
    summary.textContent = `公開測資 ${index + 1}：${test.name}`;
    details.append(summary);
    if (Object.keys(test.files || {}).length) {
      const heading = document.createElement("h4");
      heading.textContent = "執行前檔案";
      details.append(heading);
      for (const [filename, content] of Object.entries(test.files)) {
        details.append(createCodeBlock(filename, content));
      }
    }
    details.append(createCodeBlock("標準輸入", test.input || "（無）"));
    details.append(createCodeBlock("預期輸出", test.expected_output || "（無標準輸出）"));
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

function openProblem(problemId) {
  const problem = problems.find((item) => item.id === problemId);
  if (!problem) {
    showBanner(`找不到題目 ${problemId}`);
    return;
  }
  clearBanner();
  currentProblem = problem;
  setText("#problem-id", `PROBLEM ${problem.id}`);
  setText("#problem-title", problem.title);
  setText("#problem-description", problem.description);
  setText("#problem-input", problem.input);
  setText("#problem-output", problem.output);
  setText("#sample-input", problem.sample_input || "（無標準輸入）");
  setText("#sample-output", problem.sample_output || "（無標準輸出）");
  setText("#limits", `${problem.time_limit}s · Browser Judge`);
  elements.sourceLink.href = problem.source;
  renderPublicTests(problem);
  elements.codeEditor.value = "# 請在這裡撰寫 Python 程式\n";
  elements.resultPanel.hidden = true;
  elements.problemListView.hidden = true;
  elements.problemView.hidden = false;
  history.replaceState(null, "", `?problem=${encodeURIComponent(problem.id)}`);
  window.scrollTo({ top: 0, behavior: "smooth" });
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
    details.append(createCodeBlock("Input", result.input || "（無）"));
    details.append(createCodeBlock("Expected", result.expected || "（無標準輸出）"));
    details.append(createCodeBlock("Actual", result.actual || "（無標準輸出）"));
    if (result.error) details.append(createCodeBlock("Error", result.error));
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
  const code = elements.codeEditor.value;
  elements.submitButton.disabled = true;
  elements.submitButton.textContent = workerReady ? "判題中…" : "載入 Python…";
  showBanner("第一次使用需下載 Pyodide；之後會由你的瀏覽器直接執行。", "info");
  try {
    const results = await judgeInBrowser(currentProblem, code);
    clearBanner();
    const summary = renderResult(results, currentProblem.tests.length);
    saveHistory(currentProblem, code, summary);
  } catch (error) {
    showBanner(`判題失敗：${error.message}`);
  } finally {
    elements.submitButton.disabled = false;
    elements.submitButton.textContent = "在瀏覽器判題";
  }
}

elements.backButton.addEventListener("click", () => {
  currentProblem = null;
  elements.problemView.hidden = true;
  elements.problemListView.hidden = false;
  history.replaceState(null, "", window.location.pathname);
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
