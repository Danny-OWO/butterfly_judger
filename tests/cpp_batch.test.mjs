import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = fs.readFileSync(new URL("../dist/app.js", import.meta.url), "utf8")
  .split('elements.unitBackButton.addEventListener')[0];
const tests = [
  { input: "中文 1", output: "2" },
  { input: "2", output: "3" },
  { input: "3", output: "4" },
];
const encoded = (value) => Buffer.from(value).toString("base64");
const result = (token, output, status = 3) => ({ token, stdout: encoded(output), status: { id: status } });

function harness(responses) {
  const calls = [];
  const context = vm.createContext({
    document: { querySelector: () => ({}) },
    TextEncoder, TextDecoder, URLSearchParams, AbortSignal,
    btoa: (value) => Buffer.from(value, "binary").toString("base64"),
    atob: (value) => Buffer.from(value, "base64").toString("binary"),
    setTimeout: (callback) => callback(),
    fetch: async (url, options) => {
      calls.push({ url: new URL(url), options });
      assert.ok(responses.length, "unexpected extra API request");
      const response = responses.shift();
      return { ok: response.ok ?? true, status: response.status ?? 200, json: async () => response.body };
    },
  });
  vm.runInContext(source, context);
  return { calls, run: (comparison, cases = tests) => context.executeBatch("// 中文\nint main() {}", cases, comparison), context };
}

const created = () => ({ body: [{ token: "a" }, { token: "b" }, { token: "c" }] });
const batch = (...submissions) => ({ body: { submissions } });

test("one POST submits all tests; out-of-order results retain input order and only pending tokens are polled", async () => {
  const h = harness([
    created(),
    batch(result("c", "4"), result("a", "2"), result("b", "", 2)),
    batch(result("b", "3")),
  ]);
  const results = await h.run();
  assert.deepEqual(Array.from(results, (item) => item.stdout), ["2", "3", "4"]);
  assert.equal(h.calls.length, 3);
  const payload = JSON.parse(h.calls[0].options.body);
  assert.equal(h.calls[0].url.pathname, "/submissions/batch");
  assert.equal(payload.submissions.length, 3);
  assert.equal(Buffer.from(payload.submissions[0].stdin, "base64").toString(), "中文 1");
  assert.equal(Buffer.from(payload.submissions[0].source_code, "base64").toString(), "// 中文\nint main() {}");
  assert.equal(h.calls[1].url.searchParams.get("tokens"), "a,b,c");
  assert.equal(h.calls[2].url.searchParams.get("tokens"), "b");
});

test("first failure returns immediately even while later tests are pending", async () => {
  const h = harness([created(), batch(result("a", "wrong"), result("b", "", 2), result("c", "", 1))]);
  const results = await h.run();
  assert.equal(results.length, 1);
  assert.equal(h.context.verdict(results[0], "2").status, "WA");
  assert.equal(h.calls.length, 2);
});

test("later failure waits for preceding tests to finish", async () => {
  const h = harness([created(), batch(result("b", "wrong"), result("a", "", 2)), batch(result("a", "2"))]);
  assert.deepEqual(Array.from(await h.run(), (item) => item.token), ["a", "b"]);
  assert.equal(h.calls[2].url.searchParams.get("tokens"), "a,c");
});

test("numeric tolerance remains supported", async () => {
  const h = harness([created(), batch(result("a", "2.000001"), result("b", "3"), result("c", "4"))]);
  assert.equal((await h.run("numeric-tolerance")).length, 3);
});

for (const [id, expected] of [[6, "CE"], [5, "TLE"], [11, "RE"]]) {
  test(`${expected} preserves verdict and decoded diagnostics`, async () => {
    const h = harness([created(), batch({ ...result("a", "", id), compile_output: encoded("編譯錯誤"), stderr: encoded("執行錯誤") })]);
    const [execution] = await h.run();
    assert.equal(h.context.verdict(execution, "2").status, expected);
    assert.equal(execution.compile_output, "編譯錯誤");
    assert.equal(execution.stderr, "執行錯誤");
  });
}

test("partially rejected creation is a service error, never a student verdict", async () => {
  const h = harness([{ body: [{ token: "a" }, { source_code: ["invalid"] }, { token: "c" }] }]);
  await assert.rejects(h.run(), /測資 2 提交失敗/);
  assert.equal(h.calls.length, 1);
});

test("HTTP errors surface without resubmitting", async () => {
  const h = harness([{ ok: false, status: 429, body: { error: "Too many requests" } }]);
  await assert.rejects(h.run(), /Too many requests/);
  assert.equal(h.calls.length, 1);
});

test("incomplete results time out and never produce AC", async () => {
  const h = harness([created(), ...Array.from({ length: 30 }, () => batch(result("a", "", 2)))]);
  await assert.rejects(h.run(), /判題逾時/);
  assert.equal(h.calls.length, 31);
});

test("malformed batch responses fail clearly", async () => {
  const h = harness([created(), { body: {} }]);
  await assert.rejects(h.run(), /批次結果格式不正確/);
});

test("34 tests are split at the service's 20-item limit for both POST and GET", async () => {
  const tokens = Array.from({ length: 34 }, (_, index) => `token-${index}`);
  const h = harness([
    { body: tokens.slice(0, 20).map((token) => ({ token })) },
    { body: tokens.slice(20).map((token) => ({ token })) },
    batch(...tokens.slice(0, 20).map((token) => result(token, "2"))),
    batch(...tokens.slice(20).reverse().map((token) => result(token, "2"))),
  ]);
  const results = await h.run(undefined, Array.from({ length: 34 }, () => tests[0]));
  assert.deepEqual(Array.from(results, (item) => item.token), tokens);
  assert.deepEqual(h.calls.slice(0, 2).map((call) => JSON.parse(call.options.body).submissions.length), [20, 14]);
  assert.deepEqual(h.calls.slice(2).map((call) => call.url.searchParams.get("tokens").split(",").length), [20, 14]);
});
