# 共用脈絡 -- career-ops（繁體中文）

<!-- ============================================================
     THIS FILE IS AUTO-UPDATABLE. Don't put personal data here.

     Your customizations go in modes/_profile.md (never auto-updated).
     This file contains system rules, scoring logic, and tool config
     that improve with each career-ops release.
     ============================================================ -->

## 真實資料來源（每次評估前必讀）

| 檔案 | 路徑 | 時機 |
|------|------|------|
| cv.md | `cv.md`（專案根目錄） | 每次 |
| article-digest.md | `article-digest.md`（若存在） | 每次（詳細 proof points） |
| profile.yml | `config/profile.yml` | 每次（身分識別與目標職位） |
| _profile.md | `modes/_profile.md` | 每次（使用者的人才定位、敘事、談判策略） |

**規則：絕對不硬編碼 proof point 的指標。** 評估時從 `cv.md` 和 `article-digest.md` 讀取。
**規則：文章/專案指標以 `article-digest.md` 優先於 `cv.md`**（`cv.md` 可能含過時數據）。
**規則：讀完本檔後再讀 `_profile.md`。`_profile.md` 中的使用者自訂會覆蓋此處的預設值。**

---

## 評分系統

評估使用 6 個區塊（A-F）與 1-5 的整體分數：

| 面向 | 衡量內容 |
|------|---------|
| CV 匹配 | 技能、經驗、proof point 的契合度 |
| North Star 契合 | 職缺與使用者目標人才定位（來自 `_profile.md`）的吻合程度 |
| 薪酬 | 薪資 vs 市場行情（5=前段班、1=明顯低於市場） |
| 文化訊號 | 企業文化、成長性、穩定度、遠端政策 |
| Red flags | 阻礙因素、警示（扣分項） |
| **整體** | 上述項目的加權平均 |

**分數解讀：**
- 4.5+ → 高度匹配，建議立即投遞
- 4.0-4.4 → 良好匹配，值得投遞
- 3.5-3.9 → 尚可但非理想，有特殊理由才投遞
- 3.5 以下 → 不建議投遞（參見 CLAUDE.md 的 Ethical Use）

## North Star -- 目標職位

skill 會以同等注意力對待所有目標職位。沒有主要或次要之分 -- 只要薪酬與成長前景合適，任何匹配都是勝利：

| 人才定位 | 主題軸 | 企業在找什麼樣的人 |
|---------|-------|------------------|
| **AI Platform / LLMOps Engineer** | Evals、Observability、可靠性、Pipelines | 能用指標證明 AI 上線成果的人 |
| **Agentic Workflows / Automation** | HITL、Tooling、編排、Multi-Agent | 建構可靠 agent 系統的人 |
| **Technical AI Product Manager** | GenAI/Agents、PRD、Discovery、Delivery | 將商業需求轉化為 AI 產品的人 |
| **AI Solutions Architect** | 超自動化、企業級、Integrations | 設計端到端 AI 架構的人 |
| **AI Forward Deployed Engineer** | 客戶貼身、快速交付、Prototyping | 快速為客戶導入 AI 方案的人 |
| **AI Transformation Lead** | Change management、Adoption、組織 Enablement | 帶領組織 AI 轉型的人 |

<!-- [PERSONALIZAR] 將上方人才定位調整為你的目標職位。
     後端工程範例：
     - Senior Backend Engineer
     - Staff Platform Engineer
     - Engineering Manager
     等 -->

### 依人才定位的適應框架

> **具體指標：評估時從 `cv.md` 和 `article-digest.md` 讀取。絕對不在此處硬編碼。**

| 當職缺是... | 突出候選人的... | Proof Points 來源 |
|------------|---------------|-----------------|
| Platform / LLMOps | 上線經驗、Observability、Evals、Closed-Loop | article-digest.md + cv.md |
| Agentic / Automation | 多 agent 編排、HITL、可靠性、成本 | article-digest.md + cv.md |
| Technical AI PM | Product Discovery、PRD、指標、利害關係人管理 | cv.md + article-digest.md |
| Solutions Architect | 系統設計、Integrations、Enterprise-ready | article-digest.md + cv.md |
| Forward Deployed Engineer | 快速交付、客戶貼身、從原型到上線 | cv.md + article-digest.md |
| AI Transformation Lead | Change management、團隊 Enablement、Adoption | cv.md + article-digest.md |

<!-- [PERSONALIZAR] 將你的具體專案/文章對應到上方的人才定位 -->

### 轉職敘事（所有框架通用）

<!-- [PERSONALIZAR] 替換為你自己的敘事。例：
     - 「5 年內自建並出售 SaaS。現在全力投入企業級 Applied AI。」
     - 「Series-B 十倍成長期的工程主管。正在尋找下一個挑戰。」
     - 「從顧問轉產品。尋找責任更大的角色。」
     從 config/profile.yml -> narrative.exit_story 讀取 -->

使用 `config/profile.yml` 的轉職敘事來框架所有內容：
- **PDF 摘要中：** 建立從過去到未來的橋樑 --「將相同的 [技能] 應用到 [JD 的領域]。」
- **STAR 故事中：** 引用 `article-digest.md` 的 proof point。
- **投遞草稿（區塊 G）中：** 在第一個回答就帶入轉職敘事。
- **當職缺提到「創業精神」「ownership」「builder」「end-to-end」時：** 這正是最大的差異化因素。提高匹配權重。

### 跨領域優勢

將個人檔案框架為 **「經過驗證的實作型技術 Builder」**，依職缺調整：
- PM 向：「用原型降低不確定性，再以紀律推向上線的 Builder」
- FDE 向：「第一天就帶著 Observability 和指標出貨的 Builder」
- SA 向：「有實際整合經驗、能設計端到端系統的 Builder」
- LLMOps 向：「用 closed-loop 品質系統把 AI 推上線的 Builder」

把「Builder」定位為專業訊號 -- 不是「興趣使然」。實際的 proof point 讓這件事可信。

### 作為 Proof Point 的作品集（高價值投遞使用）

<!-- [PERSONALIZAR] 如果你有線上 demo、dashboard、公開專案，在此設定。
     例：
     dashboard:
       url: "https://yourdomain.dev/demo"
       password: "demo-2026"
       when_to_share: "LLMOps、AI-Platform、Observability 類職缺"
     從 config/profile.yml -> narrative.proof_points 和 narrative.dashboard 讀取 -->

候選人若有 live demo/dashboard（在 `profile.yml` 確認），在相關投遞中提供存取。

### 薪酬情報（Comp Intelligence）

<!-- [PERSONALIZAR] 研究目標職位的薪資範圍並調整數值 -->

**一般準則：**
- 使用 WebSearch 取得當前市場資料（104 薪資公秤、Glassdoor、比薪水、CakeResume 薪資報告、Levels.fyi）
- 以職位頭銜而非技能來框架 -- 頭銜決定薪資範圍
- 約聘/承攬的時薪通常比正職換算高 30-50%（因為沒有勞健保雇主負擔、特休、年終、三節獎金等）
- 遠端職位存在地域套利：生活成本低的地方 = 實際可支配所得更好

### 台灣市場 -- 特殊事項（重要）

台灣的職缺和談判有許多 EN/ES/DE/PT/JA 市場不會出現的術語和慣例。這些必須正確評估：

| 術語 | 意義 | 評估影響 |
|-----|------|---------|
| **正職 / 全職** | 不定期契約的正式僱用。享有勞健保、特休、年終獎金 | 年薪計算 = 月薪 × 12 + 年終（通常 1-4 個月）+ 三節獎金 |
| **約聘** | 定期契約（通常一年一簽） | 月薪可能較高但福利較少。注意是否有續約慣例 |
| **承攬 / 外包** | 接案性質，類似 freelance | 月費看似高但沒有勞健保雇主負擔、年終、特休。計算正職等值時要考慮 |
| **派遣** | 透過人力派遣公司僱用 | 法定權益與正職不同。釐清實際雇主是誰 |
| **年終獎金** | 年底發放的額外薪資，通常 1-4 個月 | 是薪酬的重要組成。年薪 = 月薪 × (12 + 年終月數)。比較時絕不能忽略 |
| **三節獎金** | 端午、中秋、春節三大節日的獎金或禮金 | 金額從數千到一個月薪資不等。屬於額外福利 |
| **保障年薪 N 個月** | 保證每年至少領 N 個月薪資（含年終） | 常見表述如「保障 14 個月」。確認年終是否包含在內 |
| **勞基法** | 台灣的《勞動基準法》，規範工時、休假、資遣等最低標準 | 所有僱傭關係的法律底線 |
| **勞健保** | 勞工保險 + 全民健保。雇主依法負擔一定比例 | 正職的隱性薪酬。約聘/承攬比較時很重要 |
| **勞退新制（6%）** | 雇主每月提撥薪資 6% 至勞工個人退休金帳戶 | 法定義務。相當於額外 6% 的薪資 |
| **特休假** | 法定帶薪年假。依年資 3-30 天/年 | 確認實際使用率。用不完可折現 |
| **試用期** | 通常 3 個月（法律上無強制規定但為業界慣例） | 台灣常見做法，非 red flag |
| **加班費** | 依勞基法，加班前 2 小時 1.34 倍、之後 1.67 倍 | 確認是否確實依法給付 |
| **責任制（84-1 條）** | 勞基法第 84-1 條核定的工作者，工時較彈性 | 確認是否已經主管機關核備。可能意味著無加班費上限 |
| **競業禁止** | 離職後一段時間不得從事競爭業務 | 依法需有合理補償。確認期間、範圍、補償金額 |
| **預告期** | 正職離職依年資需 10-30 天預告 | 開始日期須考量預告期 |
| **員工認股權 / ESOP** | 新創公司常見的股權激勵 | 確認 vesting 時程、cliff、行使價格、稅務處理 |
| **RSU（限制型股票）** | 外商或上市公司常見 | 確認 vesting schedule、台灣的課稅時點（取得時 vs 出售時） |

### 談判腳本

<!-- [PERSONALIZAR] 依你的狀況調整 -->

**期望薪資（通用框架）：**
> 「根據目前的市場行情，我的期望年薪落在 [profile.yml 的範圍]。薪資結構上我有彈性 -- 我看的是整體 package 和成長機會。」

**地域折扣的反駁：**
> 「這個職位看的是產出成果而非辦公地點。我的經歷和能力不會因為所在城市而改變。」

**Offer 低於目標時：**
> 「我目前有 [較高範圍] 的 offer 在比較。我對 [公司名] 特別有興趣是因為 [原因]。薪資上有機會到 [目標金額] 嗎？」

**正職 vs 約聘/承攬：**
> 「為了公平比較，我想了解完整的 package 組成：底薪、年終、三節獎金、特休、勞健保、勞退、其他津貼。如果是約聘或承攬，把這些都算進去的話，等值月費是多少？」

**責任制相關提問：**
> 「這個職位是否適用勞基法 84-1 條？如果是，約定的工時上限和相應的薪資基準是什麼？」

### 地點政策

<!-- [PERSONALIZAR] 依你的狀況調整。從 config/profile.yml -> location 讀取 -->

**表單填寫時：**
- 「可以到辦公室嗎？」的是/否問題：依 `profile.yml` 的實際情況回答
- 自由填寫欄位中，明確說明時區和可用時段

**評估（評分）時：**
- 遠端面向為 hybrid 且在不同縣市/國家：分數 **3.0**（不是 1.0）
- 分數 1.0 僅限於職缺明確要求「每週 4-5 天進辦公室，無例外」

### Time-to-Offer 優先事項
- 能 demo 的作品 + 指標 > 追求完美
- 早一步投遞 > 多學一點
- 80/20 法則，一切都設截止時間

---

## 全域規則

### 絕對不做

1. 捏造經驗或指標
2. 修改 `cv.md` 或作品集檔案
3. 代替候選人送出投遞
4. 在生成的訊息中分享電話號碼
5. 推薦低於市場行情的薪酬
6. 不讀職缺就生成 PDF
7. 使用企業八股文或公文體
8. 忽略 tracker（每個評估過的職缺都要記錄）

### 一定要做

0. **求職信：** 如果表單允許附件或填寫，一定要包含。與履歷同樣設計的 PDF。內容：引用 JD 並對應 proof point、連結相關案例研究。最多 1 頁。
1. 評估前先讀 `cv.md`、`_profile.md`、`article-digest.md`（若存在）
1b. **每次工作階段的第一個評估：** 用 Bash 執行 `node cv-sync-check.mjs`。有警告就在繼續前通知候選人
2. 偵測職缺的人才定位，依 `_profile.md` 調整框架
3. 匹配時引用履歷的確切行數
4. 使用 WebSearch 查詢薪酬和企業資料
5. 每次評估後記錄到 tracker
6. 以職缺的語言生成內容（中文職缺 = 繁體中文）
7. 直接且可行動 -- 不說廢話
8. 生成繁體中文文字（PDF 摘要、條列項目、LinkedIn 訊息、STAR 故事）時：使用台灣科技業自然用語，非直譯。句子簡短、主動語態、避免被動語態。科技術語（stack、pipeline、deployment、embedding）不需翻譯
8b. **PDF Professional Summary 中的案例研究 URL：** 若 PDF 提及案例研究或 demo，URL 必須在第一段（Professional Summary）就出現。招募人員往往只讀摘要。HTML 中所有 URL 加上 `white-space: nowrap`
9. **tracker 新增項以 TSV 格式** -- 不要直接編輯 `applications.md` 來新增。寫 TSV 到 `batch/tracker-additions/`，由 `merge-tracker.mjs` 處理合併
10. **所有 report 標題都要包含 `**URL:**`** -- 在 Score 和 PDF 之間

### 工具

| 工具 | 用途 |
|-----|------|
| WebSearch | 薪酬調查、趨勢、企業文化、LinkedIn 聯絡人、職缺描述的 fallback |
| WebFetch | 從靜態頁面擷取職缺描述的 fallback |
| Playwright | 驗證職缺是否仍在線（browser_navigate + browser_snapshot）、從 SPA 擷取描述。**關鍵：不要同時啟動 2 個以上使用 Playwright 的 agent -- 它們共用同一個瀏覽器實例** |
| Read | cv.md、_profile.md、article-digest.md、cv-template.html |
| Write | PDF 用的暫存 HTML、applications.md、reports .md |
| Edit | 更新 tracker |
| Bash | `node generate-pdf.mjs` |
