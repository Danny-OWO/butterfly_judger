(function initializeButterflyAccount() {
  const config = window.BUTTERFLY_SUPABASE || {};
  const url = String(config.url || "").trim().replace(/\/$/, "");
  const publishableKey = String(config.publishableKey || "").trim();
  const authEmailDomain = String(
    config.authEmailDomain || "students.danny-owo.github.io"
  ).trim().toLowerCase();
  const configured =
    /^https:\/\/.+\.supabase\.co$/i.test(url) &&
    publishableKey.length > 20 &&
    !publishableKey.startsWith("YOUR_");
  const client = configured
    ? window.supabase.createClient(url, publishableKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      })
    : null;

  function requireClient() {
    if (!client) {
      const error = new Error("Supabase 尚未設定，請先填入 Project URL 與 publishable key");
      error.code = "SUPABASE_NOT_CONFIGURED";
      throw error;
    }
    return client;
  }

  function normalizeUsername(username) {
    const normalized = String(username || "").trim().toLowerCase();
    if (!/^[a-z0-9_-]{3,24}$/.test(normalized)) {
      throw new Error("使用者名稱須為 3–24 個英文字母、數字、底線或連字號");
    }
    return normalized;
  }

  function usernameToEmail(username) {
    return `${normalizeUsername(username)}@${authEmailDomain}`;
  }

  function studentFromUser(user) {
    if (!user) return null;
    return {
      id: user.id,
      username:
        user.user_metadata?.username ||
        String(user.email || "student").split("@", 1)[0],
    };
  }

  function readableError(error) {
    const message = String(error?.message || error || "未知錯誤");
    if (/invalid login credentials/i.test(message)) return "使用者名稱或密碼錯誤";
    if (/user already registered/i.test(message)) return "這個使用者名稱已被註冊";
    if (/password should be/i.test(message)) return "密碼至少需要 7 個字元";
    if (/email address.*invalid|email_address_invalid/i.test(message)) {
      return "Supabase 拒絕了內部帳號格式，請通知老師檢查帳號設定";
    }
    if (/failed to fetch|network/i.test(message)) return "無法連線 Supabase，請稍後重試";
    return message;
  }

  async function register(username, password) {
    const normalized = normalizeUsername(username);
    const { data, error } = await requireClient().auth.signUp({
      email: usernameToEmail(normalized),
      password,
      options: { data: { username: normalized } },
    });
    if (error) throw new Error(readableError(error));
    if (!data.session) {
      throw new Error("Supabase 尚未關閉 Confirm email，內部帳號無法完成登入");
    }
    return studentFromUser(data.user);
  }

  async function login(username, password) {
    const { data, error } = await requireClient().auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    });
    if (error) throw new Error(readableError(error));
    return studentFromUser(data.user);
  }

  async function logout() {
    const { error } = await requireClient().auth.signOut();
    if (error) throw new Error(readableError(error));
  }

  async function currentStudent() {
    if (!client) return null;
    const { data, error } = await client.auth.getSession();
    if (error) throw new Error(readableError(error));
    return studentFromUser(data.session?.user);
  }

  async function saveSubmission(submission) {
    const student = await currentStudent();
    if (!student) return false;
    const { error } = await requireClient().from("submissions").insert({
      problem_id: submission.problem_id,
      code: submission.code,
      status: submission.status,
      passed: submission.passed,
      total: submission.total,
    });
    if (error) throw new Error(readableError(error));
    return true;
  }

  async function progress() {
    const { data, error } = await requireClient()
      .from("submissions")
      .select("problem_id,status,passed,total,submitted_at")
      .order("submitted_at", { ascending: false });
    if (error) throw new Error(readableError(error));

    const byProblem = new Map();
    for (const submission of data || []) {
      const previous = byProblem.get(submission.problem_id);
      if (!previous) {
        byProblem.set(submission.problem_id, {
          problem_id: submission.problem_id,
          attempts: 1,
          best_passed: submission.passed,
          total: submission.total,
          solved: submission.status === "AC",
          last_submitted_at: submission.submitted_at,
        });
      } else {
        previous.attempts += 1;
        previous.best_passed = Math.max(previous.best_passed, submission.passed);
        previous.total = Math.max(previous.total, submission.total);
        previous.solved ||= submission.status === "AC";
      }
    }
    return [...byProblem.values()].sort((a, b) =>
      a.problem_id.localeCompare(b.problem_id)
    );
  }

  window.ButterflyAccount = Object.freeze({
    configured,
    currentStudent,
    login,
    logout,
    progress,
    register,
    saveSubmission,
  });
})();
