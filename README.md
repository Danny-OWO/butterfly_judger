# Butterfly Judger

一個以教學為目的的 Python 練習系統。公開版本部署在 GitHub Pages，使用 Pyodide 在學生自己的瀏覽器執行程式，不需要常駐後端或付費運算資源。

## 公開網站功能

- Pyodide + Web Worker 瀏覽器判題
- 支援 `AC`、`WA`、`RE`、`TLE`
- 每筆測資前重建獨立虛擬檔案系統
- 支援 `open()`、讀檔、寫檔與檔案內容驗證
- 公開顯示測資、預期輸出與預期檔案
- 最近 50 次 submission 保存在學生瀏覽器的 `localStorage`
- 101～110 基本程式設計與 901～910 檔案處理題庫；題目重新表述且不收錄參考解答

第一次判題時，瀏覽器需要從 CDN 下載 Pyodide。執行學生程式會使用學生裝置的 CPU 與記憶體，不會消耗網站擁有者的伺服器資源。

## CLI Judge 功能

- 從 `problems/<題號>/tests` 載入 `.in` / `.out` 測資組
- 每筆測資分開執行提交的 Python 程式
- 支援以下判定：
  - `AC`：全部測資正確
  - `WA`：輸出錯誤
  - `RE`：程式執行失敗
  - `TLE`：超過題目時間限制
- 輸出採逐字元嚴格比對，包含空白、空行與最後換行
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

測試涵蓋 AC、WA、RE、TLE、嚴格輸出比對，以及不完整測資的錯誤處理。

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

## GitHub Pages Browser Judge

本機預覽：

```powershell
python -m http.server 8080 --directory frontend
```

開啟 `http://127.0.0.1:8080`。推送到 `main` 後，`.github/workflows/pages.yml` 會部署 `frontend/`，不需要設定 API URL。

Browser Judge 的題庫位於 `frontend/problems.json`，執行器位於 `frontend/pyodide-worker.mjs`。公開測資不是安全機密；任何人都能透過瀏覽器開發者工具讀取。

## 可選 Backend

FastAPI、SQLite 與 Docker runner 暫時保留，供未來需要隱藏測資、跨裝置紀錄、帳號或正式成績時使用。現在的 GitHub Pages 網站不會呼叫這個 backend。

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
5. ✅ Phase 5：Pyodide Browser Judge 與 101～110、901～910 公開題庫
6. ⬜ Phase 6：擴充題庫、submission history 介面與教師工具

目前公開版完全使用瀏覽器判題。只有未來需要可信任的隱藏測資或正式評分時，才需要部署 API 與 sandbox。
