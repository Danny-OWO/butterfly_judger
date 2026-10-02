# Butterfly Judger

一個以教學為目的、逐步打造的 Python Online Judge。目前 Phase 1 已完成，Phase 2 的 Docker runner 已加入並等待 Docker 環境整合測試，Phase 3 的 FastAPI 骨架也已建立。

## 目前功能

- 從 `problems/<題號>/tests` 載入 `.in` / `.out` 測資組
- 每筆測資分開執行提交的 Python 程式
- 支援以下判定：
  - `AC`：全部測資正確
  - `WA`：輸出錯誤
  - `RE`：程式執行失敗
  - `TLE`：超過題目時間限制
- 比對輸出時忽略每行尾端空白及檔案末尾換行
- 顯示失敗測資、執行時間與安全截斷後的錯誤訊息

> 注意：Phase 1 會直接在本機執行指定程式，只適合執行自己信任的程式碼。尚未加入 Docker sandbox，請勿把這個版本直接公開成網路服務。

## 使用方式

需要 Python 3.11 以上版本，不需要安裝第三方套件。

```powershell
python judge.py 001 solutions/example.py
```

預期輸出：

```text
Problem 001: 兩數相加

Test 01: AC
Test 02: AC

Result: AC
Passed: 2/2
```

判題失敗時，程式會以非零狀態碼結束，方便未來接上 CI 或 API。

## 執行測試

```powershell
python -m unittest discover -s tests -v
```

測試涵蓋 AC、WA、RE、TLE、輸出正規化，以及不完整測資的錯誤處理。

## Docker runner（Phase 2）

先安裝並啟動 Docker Desktop，然後建立 runner image：

```powershell
docker build -t butterfly-python-runner:latest sandbox
python judge.py 001 solutions/example.py --runner docker
```

Docker runner 使用無網路、記憶體、CPU、process、唯讀檔案系統及 Linux capability 等限制。它仍需要在實際部署平台進行壓力測試與安全檢查，不能因為「放進 container」就假設絕對安全。

## FastAPI（Phase 3）

建立虛擬環境並安裝套件：

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt
uvicorn backend.main:app --reload
```

API 文件會出現在 `http://127.0.0.1:8000/docs`。主要端點：

```text
GET  /api/health
GET  /api/problems
GET  /api/problems/{id}
POST /api/submissions
GET  /api/submissions/{id}
```

公開 API 強制使用 Docker runner。測試才透過 dependency override 使用 local runner，因此缺少 Docker 時不會意外在 host 執行網路使用者送來的程式。

## GitHub Pages 前端（Phase 4）

本機預覽：

```powershell
python -m http.server 8080 --directory frontend
```

開啟 `http://127.0.0.1:8080`，按右上角「API 設定」連到 backend。推送到 `main` 後，`.github/workflows/pages.yml` 會部署 `frontend/`。第一次使用仍須到 repository 的 **Settings → Pages → Source** 選擇 **GitHub Actions**。

部署到網路時，API URL 必須使用 HTTPS，而且 backend 的 `FRONTEND_ORIGINS` 必須包含 `https://danny-owo.github.io`。

## Submission history（Phase 5）

API 會自動建立 `data/judge.db`，保存 submission 的原始程式碼與判題摘要。公開的 `GET /api/submissions/{id}` 只回傳狀態、時間與通過數，不回傳原始程式碼；等帳號與權限完成後，才應加入使用者自己的程式碼查詢功能。

部署時可透過 `JUDGE_DB_PATH` 指定資料庫位置。該位置必須使用 persistent volume，否則平台重啟或重新部署時紀錄會消失。

## 題目格式

每題放在自己的目錄：

```text
problems/
└── 001/
    ├── problem.json
    └── tests/
        ├── 01.in
        ├── 01.out
        ├── 02.in
        └── 02.out
```

`problem.json` 範例：

```json
{
  "id": "001",
  "title": "兩數相加",
  "description": "輸入兩個整數 a、b，輸出 a + b。",
  "time_limit": 2.0,
  "memory_limit": 128
}
```

同名的 `.in` 與 `.out` 必須成對存在。

## 開發路線

1. ✅ Phase 1：CLI Judge
2. 🚧 Phase 2：Docker sandbox（程式已加入，待 Docker 環境整合測試）
3. ✅ Phase 3：FastAPI 與整合測試
4. ✅ Phase 4：GitHub Pages 靜態前端與部署 workflow
5. ✅ Phase 5：SQLite submission history
6. ⬜ Phase 6：帳號、教師後台與統計

GitHub Pages 只負責靜態前端；真正執行程式碼的 API 與 sandbox 會部署在另一個支援 Docker 的服務上。
