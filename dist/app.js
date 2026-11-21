const JUDGE_URL = "https://ce.judge0.com";
const JUDGE_BATCH_SIZE = 20;
const SOLVED_CACHE_PREFIX = "butterfly-solved-problems";
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
  accountLink: $("#account-link"),
  cloudSaveStatus: $("#cloud-save-status"),
};

let currentUnit = null;
let currentProblem = null;
let highlightedEditor = null;
let running = false;
let currentStudent = null;
let solvedProblemIds = new Set();

function solvedCacheKey() {
  return currentStudent ? `${SOLVED_CACHE_PREFIX}:${currentStudent.id}` : null;
}

function loadSolvedCache() {
  const key = solvedCacheKey();
  if (!key) return;
  try {
    solvedProblemIds = new Set(JSON.parse(localStorage.getItem(key) || "[]"));
  } catch (_) {
    solvedProblemIds = new Set();
  }
}

function saveSolvedCache() {
  const key = solvedCacheKey();
  if (key) localStorage.setItem(key, JSON.stringify([...solvedProblemIds]));
}

function cloudProblemId(problemId) {
  return `snakify-${problemId}`;
}

function updateProblemBadges() {
  for (const button of elements.problemList.querySelectorAll("[data-problem-id]")) {
    const solved = solvedProblemIds.has(cloudProblemId(button.dataset.problemId));
    const badge = button.querySelector(".problem-status-badge");
    if (badge) badge.hidden = !solved;
  }
}

async function refreshAccountState() {
  if (!window.ButterflyAccount?.configured) return;
  try {
    currentStudent = await window.ButterflyAccount.currentStudent();
  } catch (_) {
    currentStudent = null;
  }
  if (!currentStudent) return;
  elements.accountLink.textContent = `已登入 · ${currentStudent.username}`;
  elements.accountLink.classList.add("signed-in");
  loadSolvedCache();
  updateProblemBadges();
  try {
    solvedProblemIds = new Set(await window.ButterflyAccount.solvedProblemIds());
    saveSolvedCache();
    updateProblemBadges();
  } catch (_) {
    // The session indicator should remain accurate even if progress cannot load.
  }
}

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
  button.dataset.problemId = problem.id;
  const badge = `<span class="problem-status-badge" aria-label="已通過"${solvedProblemIds.has(cloudProblemId(problem.id)) ? "" : " hidden"}>AC</span>`;
  button.innerHTML = `<span class="problem-list-id">${problem.id}</span><span class="problem-list-title">${escapeHtml(problem.title)}</span>${badge}<span class="card-arrow" aria-hidden="true">→</span>`;
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
  elements.cloudSaveStatus.textContent = "";
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

function outputMatches(actual, expected, comparison = "exact") {
  const normalizedActual = normalize(actual);
  const normalizedExpected = normalize(expected);
  if (comparison !== "numeric" && comparison !== "numeric-tolerance") {
    return normalizedActual === normalizedExpected;
  }
  const numericActual = normalizedActual.trim();
  const numericExpected = normalizedExpected.trim();
  if (numericActual === "" || numericExpected === "") return false;

  const actualNumber = Number(numericActual);
  const expectedNumber = Number(numericExpected);
  if (!Number.isFinite(actualNumber) || !Number.isFinite(expectedNumber)) return false;
  if (comparison === "numeric") return actualNumber === expectedNumber;

  const tolerance = 1e-5 * Math.max(1, Math.abs(expectedNumber));
  return Math.abs(actualNumber - expectedNumber) <= tolerance;
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

function judgeBatches(items) {
  const batches = [];
  for (let index = 0; index < items.length; index += JUDGE_BATCH_SIZE) {
    batches.push(items.slice(index, index + JUDGE_BATCH_SIZE));
  }
  return batches;
}

async function executeBatch(code, tests, comparison) {
  const source = encodeBase64(code);
  const createdBatches = await Promise.all(judgeBatches(tests).map(async (group) => {
    const created = await responseJson(await fetch(`${JUDGE_URL}/submissions/batch?base64_encoded=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({ submissions: group.map((test) => ({ language_id: 54, source_code: source, stdin: encodeBase64(test.input), cpu_time_limit: 2, wall_time_limit: 5 })) }),
    }));
    if (!Array.isArray(created) || created.length !== group.length) {
      throw new Error("判題服務回傳的測資數量不正確");
    }
    return created;
  }));
  const created = createdBatches.flat();
  const rejected = created.findIndex((item) => !item?.token);
  if (rejected !== -1) {
    throw new Error(`測資 ${rejected + 1} 提交失敗：${JSON.stringify(created[rejected])}`);
  }
  const tokens = created.map((item) => item.token);
  if (new Set(tokens).size !== tokens.length) throw new Error("判題服務回傳重複的測資識別碼");
  const finished = new Map();
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, attempt < 2 ? 650 : 1000));
    const pending = tokens.filter((token) => !finished.has(token));
    const polled = await Promise.all(judgeBatches(pending).map(async (group) => {
      const query = new URLSearchParams({ tokens: group.join(","), base64_encoded: "true", fields: "token,stdout,stderr,compile_output,message,time,status" });
      const batch = await responseJson(await fetch(`${JUDGE_URL}/submissions/batch?${query}`, { signal: AbortSignal.timeout(10000) }));
      if (!Array.isArray(batch.submissions)) throw new Error("判題服務回傳的批次結果格式不正確");
      return batch.submissions;
    }));
    for (const result of polled.flat()) {
      if (result && pending.includes(result.token) && result.status?.id > 2) {
        finished.set(result.token, { ...result, stdout: decodeBase64(result.stdout), stderr: decodeBase64(result.stderr), compile_output: decodeBase64(result.compile_output), message: decodeBase64(result.message) });
      }
    }
    // Results may arrive out of order. Only report a contiguous prefix, just as
    // the sequential judge did, and stop polling once its first failure is known.
    const ordered = [];
    for (let index = 0; index < tokens.length; index += 1) {
      if (!finished.has(tokens[index])) break;
      const result = finished.get(tokens[index]);
      ordered.push(result);
      if (verdict(result, tests[index].output, comparison).status !== "AC") return ordered;
    }
    if (ordered.length === tests.length) return ordered;
  }
  throw new Error("判題逾時");
}

function verdict(result, expected, comparison) {
  if (result.status?.id === 6) return { status: "CE", error: result.compile_output || result.stderr || "編譯失敗" };
  if (result.status?.id === 5) return { status: "TLE", error: "執行時間超過限制" };
  if (result.status?.id !== 3) return { status: "RE", error: result.stderr || result.message || "執行錯誤" };
  if (!outputMatches(result.stdout, expected, comparison)) return { status: "WA", error: `預期輸出：\n${normalize(expected)}\n\n你的輸出：\n${normalize(result.stdout)}` };
  return { status: "AC", error: "" };
}

function renderResults(rows, total) {
  const accepted = rows.length === total && rows.every((row) => row.status === "AC");
  const passed = rows.filter((row) => row.status === "AC").length;
  elements.resultPanel.className = `result-panel ${accepted ? "ac" : "failed"}`;
  elements.resultPanel.innerHTML = `<div class="result-title">${accepted ? "AC" : rows.at(-1)?.status || "錯誤"} · ${passed}/${total}</div>${rows.map((row) => `<div class="test-row"><span>測資 ${row.index}</span><span>${row.status}</span></div>`).join("")}${rows.at(-1)?.error ? `<pre>${escapeHtml(rows.at(-1).error)}</pre>` : ""}`;
  elements.resultPanel.hidden = false;
  return { status: accepted ? "AC" : rows.at(-1)?.status || "RE", passed };
}

async function saveCloudHistory(problem, code, summary) {
  elements.cloudSaveStatus.textContent = "";
  if (!currentStudent || !window.ButterflyAccount?.configured) return;
  try {
    const saved = await window.ButterflyAccount.saveSubmission({
      problem_id: cloudProblemId(problem.id),
      code,
      status: summary.status === "CE" ? "RE" : summary.status,
      passed: summary.passed,
      total: problem.tests.length,
    });
    if (saved) {
      elements.cloudSaveStatus.textContent = "✓ 已儲存到帳號";
      elements.cloudSaveStatus.className = "cloud-save-status saved";
      if (summary.status === "AC") {
        solvedProblemIds.add(cloudProblemId(problem.id));
        saveSolvedCache();
        updateProblemBadges();
      }
    }
  } catch (error) {
    elements.cloudSaveStatus.textContent = `判題完成，但雲端紀錄儲存失敗：${error.message}`;
    elements.cloudSaveStatus.className = "cloud-save-status failed";
  }
}

async function submitCode() {
  if (running || !currentProblem) return;
  const problem = currentProblem;
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
    const results = await executeBatch(code, problem.tests, problem.comparison);
    for (let index = 0; index < results.length; index += 1) {
      const result = results[index];
      const judged = verdict(result, problem.tests[index].output, problem.comparison);
      rows.push({ index: index + 1, ...judged });
      if (judged.status !== "AC") break;
    }
    const summary = renderResults(rows, problem.tests.length);
    await saveCloudHistory(problem, code, summary);
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
refreshAccountState();
renderUnits();
routeFromUrl();
