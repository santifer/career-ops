# Appier — Sr. Frontend Development Engineer (Enterprise Solutions)

**JD**：https://job-boards.greenhouse.io/appier/jobs/7830101
**Location**：Taipei, Taiwan（remote/hybrid policy 待 HR 確認）
**Apply**：2026-05-08（Greenhouse）
**HR invite**：2026-05-11（D+3，與 Dcard 紀錄一致）— Anita @ Appier Recruitment Team
**App entry**：[applications.md #35](../data/applications.md) | [recruiter-comms.md #35](../data/recruiter-comms.md)
**Salary**：JD 未揭露 — HR call 必問（台北 Sr. FE 市場行情約 1.4M–2.4M TWD）

### HR call — confirmed scope（2026-05-11 Anita 邀約信）

- **形式**：Online interview, **60 分鐘**（比 Dcard 的 30 分長一倍，代表會深聊履歷不是純背景過水）
- **內容**：Resume discussion + self-introduction（履歷逐項討論 + 自我介紹）
- **時段池（候選人 5/11 回覆，6 個 1-hour slot，符合 5–8 要求）**：
  - Wed 2026-05-13 14:00 / 15:00 / 16:00 TPE
  - Thu 2026-05-14 14:00 / 15:00 / 16:00 TPE
  - **偏好**：2026-05-13 14:00
- **辦公時段**：Mon–Fri 09:30–18:30 TPE
- **狀態**：等 Anita 確認具體時間

---

## 1. JD 重點

**Tech stack（bullseye match for Yi-Chen）**

| Required | Preferred |
|----------|-----------|
| React.js / Vue.js | Webpack / Vite / Rspack / esbuild |
| TypeScript / ES6+ | SASS / LESS / PostCSS / Tailwind |
| HTTP / CSS / DOM 標準 | Node.js / Python / GraphQL |
| Git + CI/CD | Jest / Vitest / Playwright |
| **AI 工具經驗（Cursor / Copilot 明列在 JD required）** | Web perf 優化 / micro-frontend / data viz |

**Yi-Chen 對位**：
- React/TS/Vite/Vitest/Playwright/Tailwind 全部直接命中
- **Cursor + Claude Code daily** = JD required 條目，這是差異化錨點
- Vue.js 是 gap → JD 寫 "e.g. React.js, Vue.js"，**React 為主即可**，但要準備 Vue ecosystem 一句話高度
- GraphQL：K-Line / Binance 都沒大量用，準備一句基本概念 + 願意上手

**Responsibilities 推測 team 形態**：
- Enterprise SaaS 產品線（B2B AI 平台），不是 ads consumer side
- Frontend architecture 設計 + design system + RESTful API integration
- 有 unit / integration / E2E 測試文化 + code review pipeline
- 「resolve production issues」→ 有 oncall 或 production support 責任

---

## 2. Appier 面試流程預測（多源綜合）

| 階段 | 時間 | 形式 | 內容 |
|------|------|------|------|
| 投遞 | D+0（5/8） | Greenhouse | ✅ 已完成 |
| HR 邀約 | D+3（5/11） | Email/Phone | ✅ 已收到 |
| **HR 電訪** | D+5–10 | Phone/Video, 30 min | 背景、role、流程說明、薪資 band 探詢 |
| 等候期 | 3–7 天 | — | 用人主管書面審查 |
| **Coding 一面** | D+15 ± | Online, 1–2 hr | leetcode-style **或** live CodeSandbox 寫 React component；常見題：concurrent promise w/ concurrency limit、tree-shaped folder、CSS layout、排序+is_magic_number |
| **Tech 二面** | D+22 ± | Online, 2 hr | 2 位 tech leader（CT + CJ 是常見組合）；pure CSS + 純 JS 題；React hooks deep dive (`useState` / `useCallback` / `useMemo`)、styled-components vs CSS module、i18n、test framework；可現場查文件 |
| **Tech 三面** | D+29 ± | Online, 1 hr | VP Eng + CTO 或 Director + PM；system design、跨組合作、技術領導 |
| 結果 | D+30–40 | Email | Glassdoor 顯示 ~5 day decision turnaround |

**總時程**：投遞到 offer/拒 約 **25–40 天**（Glassdoor 平均 25 天，Dcard 紀錄 36 天）

**Glassdoor 整體**：
- 57% positive interview experience
- 難度 3.0/5（中）
- 多源評價：HR 溝通積極、會 pre-review GitHub + Medium、tech round 嚴格但會 guide

---

## 3. HR 電訪準備（5/13 或 5/14，60 分鐘）

**Anita 信明示重點**：60 分鐘 + Resume discussion + Self-introduction
→ 這不是 5–10 分鐘背景過水，是**逐項討論履歷**。準備邏輯：每段工作經歷都要能 1–2 分鐘深聊，加上 STAR 結尾。



### A. 你要問 HR 的（按優先序）

1. **Remote / Hybrid policy** — 台北 on-site 多少天/週？可全 remote 嗎？（這是 deal-breaker 等級）
2. **薪資 band** — 這個 level 的 base salary range？bonus / RSU 結構？
3. **整個流程長度 + round 數量** — 對方說多少 round、預計多久跑完
4. **Coding 一面是 leetcode-style 還是 take-home / live coding** — 提前知道準備方向
5. **Team size + reporting line** — Enterprise Solutions team 多大、Hiring manager 是誰
6. **使用 AI 工具的程度** — JD 寫 Cursor/Copilot required，team 是真的 daily 用還是寫上去而已

### B. HR 會問你的，準備好答案

**Why Appier**
- EN：「Appier sits where I want to be — a Taiwan-grown company with global enterprise scale and AI built into the product, not bolted on. The JD listing Cursor and Copilot as required tools is a strong signal that engineering culture is already past the AI-skeptic phase. That matches how I've been working for the past year, both at Binance and on my own multi-agent K-Line project.」
- 中：「Appier 處在我想去的位置——台灣本地、全球企業客戶規模、AI 是產品的一部分而不是外加。JD 把 Cursor 跟 Copilot 列為 required，說明 team 已經不是『AI 觀望期』，這跟我過去一年的工作方式一致，不管在 Binance 還是 K-Line 個人專案都是。」

**自我介紹（30–45 秒，沿用 Yahoo / Centific 那份）**
- 同 [centific-frontend.md §B](centific-frontend.md)：六年前端 + Binance KYC + AI multi-agent pipeline + Centific tech stack 高度吻合 → 換成「Appier 的 enterprise SaaS + Cursor required 切角，正好對應到我這一年在做的方向」

**Why leaving Binance**
- 同 Centific 答案：headcount reduction，非 performance；用 K-Line + AI workflow 把空檔填滿

**Salary expectations**（HR 主動問才答）
- EN：「I'm targeting the 1.6–2.2M TWD band based on my level and similar Taipei senior frontend offers, but I'd rather hear what the role budgets for first to make sure we're in the same ballpark.」
- 中：「我目標 1.6–2.2M TWD band，但想先聽 role 的預算範圍對齊一下。」
- 對方堅持要數字 → "1.8M base"（中段，留空間）

---

## 4. Coding 一面準備（D+10 後可能開始）

### 高機率題型（多源命中）

| 題目 | 重點 | 準備來源 |
|------|------|---------|
| **concurrent Promise with concurrency limit** | 模擬 thread pool，控制最多 N 個 promise 同時跑；實作 `pLimit(n)` | Notion `React interview coding problems` Q2 stale closure pattern + Promise pool LeetCode 1117 變體 |
| **tree-shaped folder component** | recursive React component、folder/file 區分、expand/collapse state | React Notion notes |
| **CSS layout from design spec** | flex/grid + responsive；不用任何 framework | 純 CSS 練習 |
| **排序 + magic number 判斷** | leetcode easy/medium；arr.sort + 條件判斷 | LeetCode 練習 |
| **React `data.map` 陷阱** | key、data 宣告位置、fragment 包 | Notion `React interview coding problems` Q1 |

### 必複習錨點

- `/Users/yclee/Diary/Notion/Simple Notebook .../React interview coding problems 0025fa54bbb64362bf0d44b7078f9a86.md`（兩題完整解答）
- 同資料夾 React Q&A：`useMemo / useCallback / memo`、`useEffect`、`useReducer`、`useRef`、`React 18`、`styled-components` 等

### Live coding 操作面

- Appier 用 **CodeSandbox** 或 **Google Docs + 自己 IDE 螢幕分享**
- **5/12 之前** 測試麥克風、螢幕分享、IDE 字級放大（24px+，對方看得到）
- 開好 React DevTools / TypeScript playground 在第二螢幕
- 準備一句：「I'd like to talk through my approach first before coding — does that work for you?」

---

## 5. Tech 二面準備（CSS + JS + React deep dive）

### React hooks 深度題（必考）

| 題目 | 一句話準備 |
|------|----------|
| `useState` vs `useReducer` 何時換 | state 變化邏輯複雜、有多個相依 update → useReducer；單純 toggle/counter → useState |
| `useCallback` 真正的用途 | 不是「優化所有 function」；是讓 child component 的 `React.memo` / `useEffect` dep array 穩定 |
| `useMemo` 何時值得 | 只在計算成本高或下游 referential equality 重要時用；亂用反而拖慢 |
| `useEffect` cleanup 執行時機 | unmount 之前 + dep change 之前下一次 effect 之前；race condition 防護 |
| `useRef` vs state | DOM 引用 / 跨 render 持久但**不觸發 re-render** 的值 |
| Stale closure 怎麼解 | dep array 加入閉包變數 / 用 `useRef` 存最新值 / functional setState |

### CSS 純題

- flex/grid 任意 layout 不用框架
- centering（multi-axis）、equal-height column、responsive sticky footer
- `position: sticky` vs `fixed` 差異
- BFC（block formatting context）影響
- CSS specificity 計算

### JS / TS 純題

- closure / hoisting / event loop / Promise 順序
- TypeScript：`unknown` vs `any`、discriminated union、type narrowing、generics
- Promise.all vs Promise.allSettled vs Promise.race
- Debounce / throttle 從零實作

### styled-components vs CSS module（多源命中）

- styled-components：runtime CSS-in-JS、props-driven theming、bundle size 較大、SSR 需 special handling
- CSS module：build-time scoped class name、零 runtime overhead、theming 較麻煩
- 「我傾向 Tailwind + CSS variables 為主，styled-components 用在需要 props-driven 變化的少數元件」

### i18n 實作

- React-i18next 為主流；key fallback chain；plural rules；RTL 配合 CSS logical properties
- Binance Arabic RTL 經驗可秀（layout mirror、icon flip、numeric direction）

---

## 6. Tech 三面準備（VP Eng / CTO 或 Director / PM）

### System design 題型

- 「設計一個 dashboard 給 enterprise client，支援 1M+ rows 即時更新」→ virtualization、WebSocket vs SSE、optimistic UI、cache strategy
- 「micro-frontend 架構你會怎麼切」→ team boundary > tech boundary、shared dependency 處理、deploy independence
- 「production issue 來了，怎麼 debug」→ Sentry/log → 重現 → bisect → fix + regression test

### Behavioral / Leadership

- 跟 PM / 後端 / Designer 衝突過嗎、怎麼解
- 帶過 mentee 嗎、code review 怎麼給 feedback
- 在 Binance 最自豪的成就是什麼（KYC schema-driven 50% 速度提升 — 沿用 Centific 錨點）
- AI workflow 怎麼說服 team 採用（K-Line 六代理人 case study）
- 五年內想往哪走（tech lead / staff engineer，不是 manager track）

### 對方會 pre-review

- GitHub: 確認 K-Line repo、ai-novel-generator repo public 且有 README
- Medium / 部落格：如果有，確認最新文章
- LinkedIn: profile 最新、Skills 包含 AI tools

---

## 7. 注意事項 / 紅線

- **Vue 不要硬裝會** — JD 寫 e.g.，誠實說「主力 React，Vue ecosystem 知道但沒 production project」
- **K-Line 不要 oversell** — 強調是 methodology validation + AI workflow 驗證，不是商業產品
- **Cursor / Claude Code 是核心差異化** — 三 round 至少各講一次具體 case
- **問完 remote policy 再決定花多少時間** — 若強制 5 day on-site，Yi-Chen 偏好可能下調，但 Appier 信義區辦公室、台北人通勤可接受
- **不要先報數字** — HR 探薪資時反問 band；Stage 2/3 才回 anchor
- **流程長 ~30 天** — 同步追其他 pipeline，不要 all-in 等 Appier
- **每 round 散場前問**「下一步是什麼、什麼時候會收到回覆」

---

## 8. 後續紀錄 gate

每 round 結束後寫回 `data/recruiter-comms.md` #35：

- [ ] HR 電訪：日期、interviewer name、remote policy、薪資 band、流程確認
- [ ] Coding 一面：題目類型、用什麼工具、自己感覺
- [ ] Tech 二面：interviewer 是誰、考了什麼、deep dive 哪些
- [ ] Tech 三面：system design 題、behavioral 重點
- [ ] Offer / 拒：comp 細節 / 拒因（如有 feedback）

---

## 參考來源

- [JD: Greenhouse Appier 7830101](https://job-boards.greenhouse.io/appier/jobs/7830101)
- [Dcard 2024/25 新鮮人面試心得 part4](https://www.dcard.tw/f/tech_job/p/258703880)
- [面試心得 — Appier (BetterLog)](https://gocreating.lation.app/blog/interview/appier)
- [2020 失敗的前端面試全記錄 — Appier 段落 (YY @ Medium)](https://z3388638.medium.com/2020-%E5%A4%B1%E6%95%97%E7%9A%84%E5%89%8D%E7%AB%AF%E5%B7%A5%E7%A8%8B%E5%B8%AB%E9%9D%A2%E8%A9%A6%E5%85%A8%E8%A8%98%E9%8C%84-7b3374a8dd7e)
- [2024.5.29 Appier SWE 面試經驗 (GoodJob)](https://www.goodjob.life/experiences/6656f65fa59b5c71aacb9d7a)
- [Glassdoor: Appier Taiwan Interviews](https://www.glassdoor.com/Interview/Appier-Taiwan-Interview-Questions-EI_IE1089725.0,6_IL.7,13_IN240.htm)
