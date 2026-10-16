const communityElements = {
  accountLink: document.querySelector("#account-link"),
  code: document.querySelector("#post-code"),
  codeCount: document.querySelector("#code-count"),
  feed: document.querySelector("#community-feed"),
  form: document.querySelector("#community-form"),
  identity: document.querySelector("#composer-identity"),
  message: document.querySelector("#community-message"),
  messageCount: document.querySelector("#message-count"),
  publishButton: document.querySelector("#publish-button"),
  refreshButton: document.querySelector("#refresh-posts"),
  signinPrompt: document.querySelector("#signin-prompt"),
  text: document.querySelector("#post-message"),
};

const categoryLabels = {
  feedback: "網站回饋",
  help: "求救",
  share: "程式分享",
};

let currentStudent = null;

function showCommunityMessage(message, tone = "error") {
  communityElements.message.textContent = message;
  communityElements.message.className = `banner ${tone}`;
  communityElements.message.hidden = false;
}

function clearCommunityMessage() {
  communityElements.message.hidden = true;
  communityElements.message.textContent = "";
}

function problemHref(problemRef) {
  if (!problemRef) return null;
  return problemRef.startsWith("U")
    ? `../snakify-cpp/?problem=${encodeURIComponent(problemRef)}`
    : `./?problem=${encodeURIComponent(problemRef)}`;
}

function formatPostTime(value) {
  return new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function createPostCard(post) {
  const article = document.createElement("article");
  article.className = `community-post post-${post.category}`;
  article.dataset.postId = post.id;

  const header = document.createElement("header");
  header.className = "post-header";
  const authorBlock = document.createElement("div");
  const author = document.createElement("strong");
  author.textContent = `@${post.author_username}`;
  const time = document.createElement("time");
  time.dateTime = post.created_at;
  time.textContent = formatPostTime(post.created_at);
  authorBlock.append(author, time);

  const metadata = document.createElement("div");
  metadata.className = "post-metadata";
  const category = document.createElement("span");
  category.className = "post-category";
  category.textContent = categoryLabels[post.category] || post.category;
  metadata.append(category);
  if (post.problem_ref) {
    const problem = document.createElement("a");
    problem.className = "problem-reference";
    problem.href = problemHref(post.problem_ref);
    problem.textContent = post.problem_ref;
    metadata.append(problem);
  }
  header.append(authorBlock, metadata);

  const message = document.createElement("p");
  message.className = "post-message";
  message.textContent = post.message;
  article.append(header, message);

  if (post.code) {
    const codeDetails = document.createElement("details");
    codeDetails.className = "post-code";
    const summary = document.createElement("summary");
    summary.textContent = "查看程式碼";
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.textContent = post.code;
    pre.append(code);
    codeDetails.append(summary, pre);
    article.append(codeDetails);
  }

  if (currentStudent?.id === post.user_id) {
    const actions = document.createElement("div");
    actions.className = "post-actions";
    const remove = document.createElement("button");
    remove.className = "delete-post-button";
    remove.type = "button";
    remove.textContent = "刪除我的貼文";
    remove.addEventListener("click", () => removePost(post, article, remove));
    actions.append(remove);
    article.append(actions);
  }

  return article;
}

function renderPosts(posts) {
  communityElements.feed.setAttribute("aria-busy", "false");
  if (!posts.length) {
    const empty = document.createElement("div");
    empty.className = "community-empty";
    const title = document.createElement("strong");
    title.textContent = "還沒有貼文";
    const hint = document.createElement("span");
    hint.textContent = "第一個提出好問題的人，通常已經解決了一半。";
    empty.append(title, hint);
    communityElements.feed.replaceChildren(empty);
    return;
  }
  communityElements.feed.replaceChildren(...posts.map(createPostCard));
}

async function loadPosts() {
  communityElements.refreshButton.disabled = true;
  communityElements.feed.setAttribute("aria-busy", "true");
  try {
    const posts = await window.ButterflyAccount.communityPosts();
    renderPosts(posts);
  } catch (error) {
    communityElements.feed.setAttribute("aria-busy", "false");
    showCommunityMessage(`無法載入討論：${error.message}`);
  } finally {
    communityElements.refreshButton.disabled = false;
  }
}

async function removePost(post, article, button) {
  if (!window.confirm("確定刪除這篇貼文？刪除後無法復原。")) return;
  button.disabled = true;
  try {
    await window.ButterflyAccount.deleteCommunityPost(post.id);
    article.remove();
    clearCommunityMessage();
    if (!communityElements.feed.children.length) renderPosts([]);
  } catch (error) {
    button.disabled = false;
    showCommunityMessage(error.message);
  }
}

function postFromForm(form) {
  const data = new FormData(form);
  return {
    category: String(data.get("category") || "help"),
    problem_ref: String(data.get("problem_ref") || "").trim(),
    message: String(data.get("message") || "").trim(),
    code: String(data.get("code") || "").trimEnd(),
  };
}

function updateCount(input, output, maximum) {
  output.textContent = `${input.value.length} / ${maximum}`;
}

communityElements.text.addEventListener("input", () =>
  updateCount(communityElements.text, communityElements.messageCount, 2000)
);
communityElements.code.addEventListener("input", () =>
  updateCount(communityElements.code, communityElements.codeCount, 20000)
);
communityElements.refreshButton.addEventListener("click", loadPosts);
communityElements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearCommunityMessage();
  const post = postFromForm(event.currentTarget);
  if (!post.message) {
    showCommunityMessage("請先寫下問題、分享內容或回饋");
    return;
  }

  communityElements.publishButton.disabled = true;
  communityElements.publishButton.textContent = "發布中…";
  try {
    await window.ButterflyAccount.createCommunityPost(post);
    event.currentTarget.reset();
    updateCount(communityElements.text, communityElements.messageCount, 2000);
    updateCount(communityElements.code, communityElements.codeCount, 20000);
    showCommunityMessage("已發布到全站討論區。", "success");
    await loadPosts();
  } catch (error) {
    showCommunityMessage(error.message);
  } finally {
    communityElements.publishButton.disabled = false;
    communityElements.publishButton.textContent = "公開發布";
  }
});

async function initializeCommunity() {
  if (!window.ButterflyAccount.configured) {
    communityElements.identity.textContent = "服務未設定";
    communityElements.signinPrompt.hidden = false;
    showCommunityMessage("Supabase 尚未設定，討論區目前無法連線。", "info");
    return;
  }

  try {
    currentStudent = await window.ButterflyAccount.currentStudent();
    if (currentStudent) {
      communityElements.identity.textContent = `@${currentStudent.username}`;
      communityElements.form.hidden = false;
      communityElements.accountLink.textContent = currentStudent.username;
      communityElements.accountLink.classList.add("signed-in");
    } else {
      communityElements.identity.textContent = "訪客模式";
      communityElements.signinPrompt.hidden = false;
    }
  } catch (error) {
    communityElements.identity.textContent = "登入狀態未知";
    communityElements.signinPrompt.hidden = false;
    showCommunityMessage(error.message);
  }
  await loadPosts();
}

initializeCommunity();
