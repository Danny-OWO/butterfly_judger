(function initializeButterflyApi() {
  const configuredUrl = document
    .querySelector('meta[name="butterfly-api-url"]')
    ?.content.trim()
    .replace(/\/$/, "");
  const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const isGitHubPages = window.location.hostname.endsWith(".github.io");
  const baseUrl = configuredUrl || (isLocal ? `http://${window.location.hostname}:8000` : "");
  const configured = Boolean(configuredUrl || isLocal || !isGitHubPages);

  async function request(path, options = {}) {
    if (!configured) {
      const error = new Error("帳號後端尚未設定");
      error.code = "API_NOT_CONFIGURED";
      throw error;
    }

    const headers = new Headers(options.headers || {});
    if (options.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    let response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers,
        credentials: "include",
      });
    } catch (_) {
      const error = new Error("無法連線帳號服務，請確認後端是否啟動");
      error.code = "API_UNREACHABLE";
      throw error;
    }

    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
      ? await response.json()
      : null;
    if (!response.ok) {
      const error = new Error(payload?.detail || `帳號服務錯誤（HTTP ${response.status}）`);
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  window.ButterflyAPI = Object.freeze({ baseUrl, configured, request });
})();
