const accountElements = {
  forms: document.querySelector("#auth-forms"),
  loginForm: document.querySelector("#login-form"),
  registerForm: document.querySelector("#register-form"),
  message: document.querySelector("#account-message"),
  sessionPanel: document.querySelector("#session-panel"),
  sessionUsername: document.querySelector("#session-username"),
  logoutButton: document.querySelector("#logout-button"),
  progressList: document.querySelector("#progress-list"),
  progressSummary: document.querySelector("#progress-summary"),
};

function showAccountMessage(message, tone = "error") {
  accountElements.message.textContent = message;
  accountElements.message.className = `banner ${tone}`;
  accountElements.message.hidden = false;
}

function clearAccountMessage() {
  accountElements.message.hidden = true;
  accountElements.message.textContent = "";
}

function setFormsDisabled(disabled) {
  for (const control of accountElements.forms.querySelectorAll("input, button")) {
    control.disabled = disabled;
  }
}

function credentialsFrom(form) {
  const data = new FormData(form);
  return {
    username: String(data.get("username") || ""),
    password: String(data.get("password") || ""),
  };
}

function renderProgress(progress) {
  const solved = progress.filter((item) => item.solved).length;
  accountElements.progressSummary.textContent = `${solved} / ${progress.length} 題完成`;
  if (!progress.length) {
    const empty = document.createElement("li");
    empty.className = "progress-empty";
    empty.textContent = "還沒有提交紀錄。去挑一題，讓蝴蝶開始飛。";
    accountElements.progressList.replaceChildren(empty);
    return;
  }
  const rows = progress.map((item) => {
    const row = document.createElement("li");
    row.className = `progress-row ${item.solved ? "solved" : "attempted"}`;
    const problem = document.createElement("strong");
    problem.textContent = item.problem_id;
    const result = document.createElement("span");
    result.textContent = item.solved
      ? `已完成 · ${item.attempts} 次嘗試`
      : `最佳 ${item.best_passed}/${item.total} · ${item.attempts} 次嘗試`;
    row.append(problem, result);
    return row;
  });
  accountElements.progressList.replaceChildren(...rows);
}

async function showSignedIn(student) {
  accountElements.sessionUsername.textContent = student.username;
  accountElements.forms.hidden = true;
  accountElements.sessionPanel.hidden = false;
  try {
    renderProgress(await window.ButterflyAPI.request("/api/progress"));
  } catch (error) {
    accountElements.progressSummary.textContent = "讀取失敗";
    showAccountMessage(error.message);
  }
}

function showSignedOut() {
  accountElements.sessionPanel.hidden = true;
  accountElements.forms.hidden = false;
  setFormsDisabled(false);
}

async function submitCredentials(event, endpoint) {
  event.preventDefault();
  clearAccountMessage();
  setFormsDisabled(true);
  try {
    const student = await window.ButterflyAPI.request(endpoint, {
      method: "POST",
      body: JSON.stringify(credentialsFrom(event.currentTarget)),
    });
    event.currentTarget.reset();
    await showSignedIn(student);
  } catch (error) {
    showAccountMessage(error.message);
    setFormsDisabled(false);
  }
}

accountElements.loginForm.addEventListener("submit", (event) =>
  submitCredentials(event, "/api/auth/login")
);
accountElements.registerForm.addEventListener("submit", (event) =>
  submitCredentials(event, "/api/auth/register")
);
accountElements.logoutButton.addEventListener("click", async () => {
  accountElements.logoutButton.disabled = true;
  try {
    await window.ButterflyAPI.request("/api/auth/logout", { method: "POST" });
    clearAccountMessage();
    showSignedOut();
  } catch (error) {
    showAccountMessage(error.message);
  } finally {
    accountElements.logoutButton.disabled = false;
  }
});

async function initializeAccountPage() {
  if (!window.ButterflyAPI.configured) {
    setFormsDisabled(true);
    showAccountMessage(
      "帳號後端尚未部署。請在頁面的 butterfly-api-url 設定 API 網址後再登入。",
      "info"
    );
    return;
  }
  try {
    await showSignedIn(await window.ButterflyAPI.request("/api/auth/me"));
  } catch (error) {
    if (error.status === 401) {
      showSignedOut();
    } else {
      setFormsDisabled(true);
      showAccountMessage(error.message);
    }
  }
}

initializeAccountPage();
