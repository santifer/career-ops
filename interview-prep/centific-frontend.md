# Centific Sr. AI-Native Frontend Engineer — Stage 1 Prep

**面試**：2026-05-12 (Tue) 15:00 TPE | Video call (Teams/Zoom 待確認) | 3 interviewers — 見 [§3 面試官 panel](#3-面試官-panel)
**HR**：Adam Chuang (莊先生) — adam.chuang@centific.com / 0913830927
**流程**：3 technical rounds total（Stage 1 / 3）
**Salary**：1.05M–1.6M TWD（1.6M ceiling Adam 已確認可接受）
**合作模式**：跟 Centific 台灣 vendor team 一起做事；**reporting line 是微軟的 manager**；無跨時區凌晨會
**AI tools**：work allows Cursor / Claude Code daily
**Score**：3.0/5（[Report 018](../reports/018-centific-2026-04-28.md)）

---

## 1. 對方公司速記（Centific = ex-Pactera EDGE rebrand）

- 前身 Pactera EDGE，2024 rebrand 為 Centific，定位 AI-first localization + product engineering 服務商
- 主力客戶：Microsoft（Azure AI / Copilot 生態）、Google、Meta
- 台北辦公室在信義區（統一國際大樓 / 誠品附近）
- 過去主力業務：localization、data labeling（OneForma 平台）；AI Frontend 是 rebrand 後新業務
- Glassdoor 整體：41.9% positive interview, 難度 2.77/5（中低）
- 平均流程長度 ~25 天

---

## 2. Stage 1 形式推測

3 interviewers + Stage 1 of 3 + Microsoft reporting line → 兩種情境準備：

| 情境 A：HR + 2 tech | 情境 B：3 tech panel |
|--------------------|---------------------|
| 比重：culture fit + 自我介紹 | 比重：技術 deep dive |
| 薪資 / 動機題機率高 | live coding 機率較高 |
| 英文要求中等 | 英文要求高（直接對微軟 manager） |
| 較可能：Stage 1 篩人 | 較可能：直接技術評估 |

**雙情境通吃**：自我介紹 + AI workflow 案例 + Microsoft client 適配性 + React/JS 概念題輕度準備。

---

## 3. 面試官 panel

Adam 已寄出三人 email（2026-05-11 確認）：

| # | 姓名 | Email | 推測 | 開會行動 |
|---|------|-------|------|---------|
| 1 | **Haitao Yang** (楊海濤?) | `haitao.yang1@centific.com` | 中文姓名 + email handle 帶 `1`（同名同事多 → 較資深可能性高）；mainland 拼音格式 → 中國 / 美國 office tech 主管機率高 | 開場記名字、聽自我介紹後標角色 |
| 2 | **Xingbiao Gu** (谷興彪?) | `xingbiao.gu@centific.com` | 中文姓名（mainland 拼音）；技術背景機率高 | 同上；live coding 若發生此人主考機率較大 |
| 3 | **Lisa WANG** (姓全大寫) | `lisa.wang@centific.com` | 大寫姓 = 台 / 港 / 星 護照格式；可能台灣本地 PM 或 People team | 中文切換可能由她開場；culture fit 題機率最大 |

**LinkedIn 公開搜不到具體 profile（無登入態下）**——
- 已試 `"Haitao Yang" Centific`、`"Xingbiao Gu" Centific`、`"Lisa Wang" Centific Taiwan` 都無命中
- Centific 公司頁有 4,000+ 員工，個人 profile 對非登入用戶隱藏
- **5/12 上午行動**：你登入 LinkedIn 自己掃一下三人，看 (a) 有無共同 connection 可預先 warm intro、(b) 各自 title 確認上面推測

**通話策略**：
- 開場英文先一輪，看 Lisa WANG 是否切中文 → 跟著切（panel 三人語言可能混合）
- 三人 email 都 @centific.com → 全 Centific 員工，**不會有微軟人**；Microsoft 那邊只是 reporting line manager
- 三題 Q1/Q2/Q3 對應三 interviewer 一人一題；散場前各自道謝叫名字（Haitao / Xingbiao / Lisa）

---

## 通話前 checklist

- [ ] 確認 Teams / Zoom link（Adam 應寄出，沒收到 5/12 上午追）
- [ ] 網路、麥克風、背景測試 → 14:50 進 waiting room
- [ ] 開好這份檔案 + cv-en.md + Centific JD 在第二螢幕
- [ ] 桌上備紙筆 + 水
- [ ] 複習 K-Line + Binance Cursor 50% 兩個 AI workflow 錨點

---

## 通話中：你要問的問題（3 個 interviewer 各 1 題）

> 先用英文開場，對方切中文你也跟著切。

- [ ] **問 #1：我會做的產品 + ownership 範圍**
  - EN：「Could you tell me more about what the team is actually building — what kind of product am I going to be working on day to day, and how much of it is owned end-to-end by the Centific Taiwan team versus driven by the Microsoft side?」
  - 中：「可以多說一下這個 team 實際在做什麼產品嗎？我每天會接觸到的產品是什麼，台灣這邊 end-to-end ownership 多少、微軟那邊主導多少？」
  - **為什麼問**：搞清楚 Centific TW 端的工程自主性，避免進來才發現只是微軟 backlog 的執行人

- [ ] **問 #2：AI tool stack 實際長什麼樣**
  - EN：「The role is titled AI-Native Frontend — what does that mean in practice? Is the team standardized on Cursor / Claude Code / Copilot, or is each engineer free to pick their own workflow?」
  - 中：「JD 寫 AI-Native Frontend，實際上 team 的 AI 工具是統一用 Cursor / Claude Code / Copilot，還是每個人自由選工作流？」
  - **為什麼問**：直接驗證「AI scope = 一般前端」的疑慮是否真的解掉

- [ ] **問 #3：微軟 manager 互動模式 + 台灣 team 規模**（如時間夠）
  - EN：「Since the reporting line goes to a Microsoft manager — what does the day-to-day cadence look like? 1:1 frequency, sync vs async, English written vs spoken? And how big is the Centific Taiwan team I'd be working alongside?」
  - 中：「reporting line 是微軟 manager，平常 daily cadence 長什麼樣？1:1 多久一次、sync 為主還是 async 為主、英文是書面還是口說？另外 Centific 台灣 team 規模多大？」
  - **為什麼問**：判斷英文 daily load（書面 vs spoken）、跟微軟 manager 直接合作的程度、台灣本地有多少同事

---

## 通話中：對方會問的，準備好的答案

### A. Why Centific？（必問）

- EN：「Centific sits at an interesting intersection — Microsoft-scale problems with the engineering autonomy of a focused product team. The AI-Native frontend angle is what convinced me to move on this role specifically; I've been building my own development workflow around Cursor and Claude Code for the past year, and I want to be in an environment where that's the default expectation, not a side experiment.」
- 中：「Centific 處在一個有意思的交叉點——做的是 Microsoft 等級的問題，但工程上有產品 team 的自主性。讓我特別想投這個職位的是 AI-Native frontend 這個切角，過去一年我自己的開發流程都圍繞 Cursor 跟 Claude Code 在做，想找一個 AI 是預設、不是 side experiment 的環境。」

### B. 自我介紹（30–45 秒版，沿用 Abee 那份）

- EN：「I'm Yi-Chen, a frontend engineer with around six years of experience. I spent most of that time at Binance working on global-scale B2C products — mainly owning the KYC frontend, focused on configurable architecture and conversion optimization. Along the way I also integrated AI-assisted tools into my daily workflow, which noticeably improved delivery speed. In my personal projects I've taken that further — using a multi-agent architecture where I focus purely on direction and decision-making while AI handles the implementation, running the full cycle from design to production. Centific stands out to me because the tech stack is a strong match, and the AI-Native frontend angle directly maps to the direction I've been pushing my own work toward.」
- 中：「我是 Yi-Chen，前端工程師，有六年左右的工程經驗。過去幾年在 Binance 做全球規模的 B2C 產品，主要負責 KYC 流程的前端，專注在可配置架構和用戶轉換率的優化——在這個過程中也把 AI 輔助工具帶進日常開發流程，明顯提升了交付效率。個人專案方面，我更進一步，嘗試用多代理人的架構做產品開發，自己只負責提供方向和決策，讓 AI 完成實作，從設計到上線全程跑通。我對 Centific 這個職位很有興趣，因為技術棧高度吻合，而且 AI-Native frontend 這個切角，正好對應到我這一年在做的方向。」

### C. AI workflow case study（最重要，準備兩個錨點 deep dive）

#### 錨點 1：Binance KYC Cursor + Claude Code 50% schema config win

- **Problem**：5 國 KYC 流程，每國規則不同；產品要新增/修改步驟，工程師要手刻 schema + 對應 React component
- **Action**：把現有 schema config + Figma 截圖丟給 Cursor / Claude Code 當 context，讓 AI 生成新 schema + component update；自己做 review 跟修整
- **Result**：schema config 開發時間砍約 50%；工程師可以把心力放在 edge case 跟 UX 細節
- **Centific tie-in**：「這套 schema-driven 加 AI 生成的流程，對 Microsoft 等級規模的多租戶 / locale-specific 客製是直接可搬的能力」

#### 錨點 2：K-Line Prediction 六代理人 pipeline

- **Problem**：自己 side project，想驗證能不能用 AI agent 替代多人 team 開發產品
- **Action**：定義六個 role 的 agent（PM / Architect / Engineer / Reviewer / QA / Designer），用 ticket-driven 方式跑開發；7 天內跑完 40+ scoped ticket
- **Result**：full-stack 上線（React/TS frontend + FastAPI backend on Cloud Run），URL: k-line-prediction-app.web.app
- **Centific tie-in**：「這個方法論能讓一個 senior engineer 在實際產品上輸出兩三個人的 throughput」

### D. 為什麼離開 Binance？

- EN：「Binance went through a headcount reduction and my position was affected. I used the time since to go deep on K-Line and on the AI workflow methodology, which I'm now applying to my next role.」
- 中：「Binance 做了組織縮編，我的職位在這次受影響。離職後我把時間拿去把 K-Line 跟 AI workflow 方法論做深，現在帶進下一份工作。」
- 追問「是表現問題嗎？」→ EN：「No — this was a company-wide headcount reduction, not performance-related. My manager was very supportive throughout.」

### E. React / JavaScript 概念題（中低機率，但要備）

| 題目方向 | 一句話準備 |
|---------|-----------|
| useEffect / useMemo 差別 | useEffect 跑副作用、useMemo 快取計算結果 + dep 變才重算 |
| React render perf 怎麼 debug | React DevTools Profiler 抓 unnecessary re-render、檢查 referential stability、必要 memo / useMemo |
| Webview Pool / micro-app 怎麼設計 | pre-load + cache 高頻 micro-app、共用渲染容器、idle 時 release |
| Electron 多進程 / 單進程切換考量 | 多進程：隔離、崩潰不互影響但記憶體高；單進程：省記憶體但要 sandbox event loop |
| RTL / i18n 做過什麼 | Binance Arabic RTL：layout mirror、icon flip、numeric direction、CSS logical properties |

### F. 薪資（等對方先開口；直到 final round 才確認數字）

- 對方主動問 → EN：「Adam and I aligned on a band already — I'd rather focus this conversation on the role and team fit, and revisit numbers when there's mutual interest.」
- 中：「我跟 Adam 之前已經對齊過 band 了，這輪我想先聚焦在 role 跟 team fit，等雙方有 mutual interest 時再回到數字會比較自然。」
- 真的被逼問具體數字 → EN：「My target is in the upper range Adam and I discussed — closer to the 1.6M ceiling than the floor.」

---

## 通話後：決策 gate

- [ ] 三位 interviewer 實際 role 是什麼（vs §3 推測）→ 寫回 `data/recruiter-comms.md` #18
- [ ] Stage 2 / 3 預期內容、時程 → 寫回
- [ ] 有沒有要求 take-home / coding test → 寫回
- [ ] 微軟 manager 互動模式 + 台灣 team 規模 → 寫回
- [ ] 我自己感覺：team fit / 想不想繼續 → 1–5 分記在 retro

---

## 注意事項

- 薪資不主動提（Adam 已搞定 band）
- AI workflow 是核心差異化，每個 interviewer 至少要聽到一次
- 微軟產品 / NDA 細節對方未必能講，不要追太緊；但「我會做什麼產品」可以問
- 三位 interviewer 都打招呼、記名字（散場可道謝）
- 中英切換看 interviewer 開口語言；技術詞彙不翻譯
- 不要 oversell K-Line — 強調是 methodology validation，不是商業產品
- 散場前一定問「下一步是什麼、什麼時候會收到回覆」
