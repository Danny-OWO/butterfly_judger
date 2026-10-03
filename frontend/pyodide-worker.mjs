const PYODIDE_BASE_URL = "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/";
let pyodide;
try {
  self.postMessage({ type: "status", message: "正在連接 Pyodide CDN…" });
  const { loadPyodide } = await import(`${PYODIDE_BASE_URL}pyodide.mjs`);
  self.postMessage({ type: "status", message: "正在下載 Python 執行環境（第一次會比較久）…" });
  pyodide = await loadPyodide({ indexURL: PYODIDE_BASE_URL });
  self.postMessage({ type: "ready" });
} catch (error) {
  self.postMessage({ type: "load-error", message: String(error) });
}

async function runTest(code, test) {
  const startedAt = performance.now();
  const setup = JSON.stringify({
    code,
    input: test.input || "",
    files: test.files || {},
    expectedFiles: test.expected_files || {},
  });
  const resultProxy = await pyodide.runPythonAsync(`
import io
import json
import os
import pathlib
import shutil
import sys
import traceback

_payload = json.loads(${JSON.stringify(setup)})
_workspace = pathlib.Path("/workspace")
os.chdir("/")
if _workspace.exists():
    shutil.rmtree(_workspace)
_workspace.mkdir()
os.chdir(_workspace)

for _name, _content in _payload["files"].items():
    _path = _workspace / _name
    _path.parent.mkdir(parents=True, exist_ok=True)
    _path.write_text(_content, encoding="utf-8")

_old_stdin, _old_stdout, _old_stderr = sys.stdin, sys.stdout, sys.stderr
sys.stdin = io.StringIO(_payload["input"])
sys.stdout = io.StringIO()
sys.stderr = io.StringIO()
_status = "OK"
try:
    exec(compile(_payload["code"], "main.py", "exec"), {"__name__": "__main__"})
except BaseException:
    _status = "RE"
    traceback.print_exc(file=sys.stderr)

_stdout = sys.stdout.getvalue()
_stderr = sys.stderr.getvalue()
sys.stdin, sys.stdout, sys.stderr = _old_stdin, _old_stdout, _old_stderr

_actual_files = {}
for _name in _payload["expectedFiles"]:
    _path = _workspace / _name
    _actual_files[_name] = _path.read_text(encoding="utf-8") if _path.is_file() else None

{"status": _status, "stdout": _stdout, "stderr": _stderr, "files": _actual_files}
  `);
  const execution = resultProxy.toJs({ dict_converter: Object.fromEntries });
  resultProxy.destroy();
  const fileFailures = [];
  for (const [filename, expected] of Object.entries(test.expected_files || {})) {
    const actual = execution.files[filename];
    if (actual === null || actual !== expected) {
      fileFailures.push(`${filename}: 檔案內容不符`);
    }
  }
  let status = execution.status;
  if (status === "OK") {
    const outputMatches = execution.stdout === (test.expected_output || "");
    status = outputMatches && fileFailures.length === 0 ? "AC" : "WA";
  }
  return {
    name: test.name,
    status,
    runtime_ms: Math.round(performance.now() - startedAt),
    input: test.input || "",
    expected: test.expected_output || "",
    actual: execution.stdout,
    error: execution.stderr,
    file_failures: fileFailures,
  };
}

self.addEventListener("message", async (event) => {
  if (event.data.type !== "judge" || !pyodide) return;
  for (const test of event.data.tests) {
    self.postMessage({ type: "test-start", test });
    const result = await runTest(event.data.code, test);
    self.postMessage({ type: "test-result", result });
  }
  self.postMessage({ type: "done" });
});
