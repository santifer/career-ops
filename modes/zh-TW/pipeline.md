# 模式：pipeline -- URL 收件匣（Second Brain）

處理累積在 `data/pipeline.md` 中的職缺 URL。候選人隨時新增 URL，之後執行 `/career-ops pipeline` 統一處理。

## 工作流程

1. **讀取** `data/pipeline.md` → 搜尋「未處理」區段中的 `- [ ]` 項目
2. **對每個未處理 URL**：
   a. 計算下一個 `REPORT_NUM` 序號（讀取 `reports/`，取最大值 + 1）
   b. **擷取 JD** 依序嘗試 Playwright（browser_navigate + browser_snapshot）→ WebFetch → WebSearch
   c. URL 無法存取 → 標記為 `- [!]` 附註說明，繼續下一個
   d. **執行完整 auto-pipeline**：評估 A-F → Report .md → PDF（分數 >= 3.0 時）→ Tracker
   e. **從「未處理」移至「已處理」**：`- [x] #NNN | URL | 公司名 | 職位名稱 | 分數/5 | PDF ✅/❌`
3. **若有 3 個以上 URL**，平行啟動 agent（Agent tool 的 `run_in_background`）以最大化速度。
4. **完成後**，顯示摘要表格：

```
| # | 公司 | 職位 | 分數 | PDF | 建議行動 |
```

## pipeline.md 格式

```markdown
## 未處理
- [ ] https://jobs.example.com/posting/123
- [ ] https://boards.greenhouse.io/company/jobs/456 | Company Inc | Senior PM
- [!] https://private.url/job — 錯誤：需要登入

## 已處理
- [x] #143 | https://jobs.example.com/posting/789 | Acme Corp | AI PM | 4.2/5 | PDF ✅
- [x] #144 | https://boards.greenhouse.io/xyz/jobs/012 | BigCo | SA | 2.1/5 | PDF ❌
```

> 注意：區段標題可以是 EN（「Pending」/「Processed」）、ES（「Pendientes」/「Procesadas」）、DE（「Offen」/「Verarbeitet」）、PT-BR（「Pendentes」/「Processadas」）、JA（「未処理」/「処理済み」）或 ZH-TW（「未處理」/「已處理」）。讀取時彈性處理，寫入時維持既有檔案的風格。

## 從 URL 智慧偵測 JD

1. **Playwright（首選）：** `browser_navigate` + `browser_snapshot`。所有 SPA 都能運作。
2. **WebFetch（備案）：** 靜態頁面，或 Playwright 不可用時。
3. **WebSearch（最後手段）：** 在索引了 JD 的次要入口網站搜尋。

**特殊情況：**
- **LinkedIn**：可能需要登入 → 標記 `[!]`，請候選人貼上文字
- **PDF**：URL 指向 PDF 時，用 Read tool 直接讀取
- **`local:` 前綴**：讀取本地檔案。例：`local:jds/cakeresume-ai-engineer.md` → 讀取 `jds/cakeresume-ai-engineer.md`
- **104 人力銀行**：台灣最大求職平台。Playwright 通常能正常運作
- **1111 人力銀行**：台灣主要求職平台之一。WebFetch 通常可存取
- **CakeResume**：台灣科技人才常用平台。Playwright 能良好運作
- **Yourator**：新創與科技業求職平台。Playwright 能良好運作
- **Meet.jobs**：跨國求職平台，台灣與東南亞職缺。通常 WebFetch 可存取
- **JECHO**：科技業獵頭平台。可能需要登入
- **LinkedIn TW**：與全球 LinkedIn 相同限制 -- 可能需要登入

## 自動編號

1. 列出 `reports/` 中的所有檔案
2. 從前綴擷取編號（例：`142-medispend...` → 142）
3. 新編號 = 找到的最大值 + 1

## 來源同步

處理任何 URL 前，確認同步：

```bash
node cv-sync-check.mjs
```

如有不同步，繼續前先通知候選人。
