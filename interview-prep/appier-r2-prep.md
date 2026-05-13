# Appier R2 Prep — Take-home + Live Session

**前置**：R1 完成（2026-05-13），詳見 [appier-sr-fe-enterprise.md §9](./appier-sr-fe-enterprise.md)

## R2 預期

| 項目 | 細節（lead 透露） |
|------|------------------|
| 時長 | 2–3 小時 |
| 格式 | take-home + 接續 live session |
| 內容 | live coding **或** agent collaborate |
| 旁聽 | R1 lead 可能在場 |
| 排程 | 等 Anita 確認 take-home 出題 + live 時段 |

**判讀**：「agent collaborate」是罕見 format，等於要 demo 你跟 AI agent 協作寫 code 的真實能力。K-Line multi-agent pipeline 直接是 in-game asset。

---

## Team 痛點（R1 已揭露 = R2 題目範圍）

1. **微服務架構溝通**（FE 角度）
2. **Tracking / SDK 經驗**
3. **iframe / webview / 網站嵌入**

→ Enterprise 客戶把 Appier widget / SDK 嵌進自己網站，痛點集中在：cross-origin 通訊、SDK loader pattern、event tracking 跨域、bundle 隔離。

---

## R2 攻擊面 A：iframe / webview / 網站嵌入（最高優先）

### A1. iframe sandbox 與 security

| 屬性 | 開啟代表 |
|------|---------|
| `allow-scripts` | iframe 內可跑 JS |
| `allow-same-origin` | 不視為 cross-origin（與父頁同 origin policy） |
| `allow-forms` | 允許表單提交 |
| `allow-popups` | 允許 window.open |
| `allow-top-navigation` | 允許改父頁 URL（**危險**） |

**Trade-off**：sandbox 越緊安全越高，但功能受限。SDK 嵌入要找平衡 — 通常 `allow-scripts allow-same-origin` 是底線，再按需加。

### A2. postMessage cross-origin 通訊

```js
// Parent
iframe.contentWindow.postMessage(
  { type: 'INIT', payload: {...} },
  'https://widget.appier.com'  // targetOrigin 一定要明確
);

// iframe
window.addEventListener('message', (e) => {
  if (e.origin !== 'https://parent.example.com') return; // 必驗 origin
  if (e.data.type !== 'INIT') return;
  // handle
});
```

**重點**：
- targetOrigin 不能用 `*`（會洩漏到任意 listener）
- 收方一定要驗 `e.origin`
- message schema 用 `type` discriminator 避免衝突

### A3. iframe vs webview 差異

| 維度 | iframe | webview |
|------|--------|---------|
| Context | 瀏覽器內子文件 | Electron / native app 內嵌瀏覽器 |
| 通訊 | postMessage | ipcRenderer + preload script |
| 隔離 | same-origin policy | OS-level process isolation |
| 適用 | 第三方網站嵌入 SDK | desktop app 內嵌 web 內容 |

**我的經驗錨點**：Binance Electron team 的 Webview Pool — 預載 + cache micro-app，webview 載入 +30%。對 Appier 來說是「同樣思路用在 iframe SDK 載入」可遷移。

### A4. 第三方嵌入：CSP / X-Frame-Options

- 父頁設 `Content-Security-Policy: frame-src https://widget.appier.com` → 限定可嵌入的來源
- Widget 設 `X-Frame-Options: ALLOW-FROM ...` 或更現代的 `Content-Security-Policy: frame-ancestors ...`
- **Clickjacking 防護**：iframe 套透明覆蓋騙點擊 → frame-ancestors 是防線

### A5. SDK loader 模式（**重點，常考**）

**gtag / fbq 經典模式**：
```js
// 用戶網站只貼一段 snippet：
(function(w,d,s,l,i){
  w[l]=w[l]||[];
  w[l].push({...}); // queue 模式，SDK 還沒載完前先排隊
  var f=d.getElementsByTagName(s)[0],
      j=d.createElement(s);
  j.async=true;
  j.src='https://cdn.appier.com/sdk.js?id='+i;
  f.parentNode.insertBefore(j,f);
})(window,document,'script','appierLayer','TENANT_ID');
```

**重點**：
- async load 不 block 父頁 render
- queue 模式：SDK 還沒載完前的 API call 先 push 進 array，載完後 flush
- TENANT_ID 從 snippet 帶入，SDK 不需 hardcode 客戶

---

## R2 攻擊面 B：微服務 / micro-frontend 溝通

### B1. Module Federation（Webpack 5）vs single-spa

| 維度 | Module Federation | single-spa |
|------|-------------------|------------|
| 整合時機 | runtime | runtime |
| 共享依賴 | 內建 `shared` config | 手動處理 |
| Build coupling | 各 app 獨立 build | 各 app 獨立 build |
| 適用 | 同公司多 team 共用 component | 多框架混搭（React + Vue + Angular） |

**Appier 場景推測**：enterprise dashboard 跨多產品線（AIRIS / AIQUA / AIXON 共用 nav + auth），Module Federation 比 single-spa 更貼。

### B2. 共享依賴怎麼處理

問題：兩個 micro-app 各自帶 React → bundle 變兩倍 + Context 不通。

解：
```js
// webpack.config.js (host)
new ModuleFederationPlugin({
  shared: {
    react: { singleton: true, requiredVersion: '^18.0.0' },
    'react-dom': { singleton: true }
  }
})
```

`singleton: true` 強制只載一次，version mismatch 會 warn。

### B3. Cross-app event bus

兩種方案：
- **CustomEvent**（browser-native）：`window.dispatchEvent(new CustomEvent('appier:track', { detail: {...} }))`
- **Pub-sub library**（mitt / tiny-emitter）：bundle +1KB，但 API 更乾淨

選 native CustomEvent，零 dep。

### B4. Build-time vs runtime integration

- Build-time：iframe / Module Federation manifest hash 在 build 期決定
- Runtime：用 import-maps 或動態 fetch SDK URL，更新 SDK 不用重 build 父頁

**Appier 場景**：客戶網站 hardcode SDK URL，runtime 動態載 → 改 SDK 不需通知客戶。

---

## R2 攻擊面 C：Tracking / SDK 設計

### C1. SDK API surface 設計（簡潔 + 不污染全域）

```js
// 全域只暴露 1 個 namespace
window.appier = {
  init(config) {},
  track(eventName, properties) {},
  identify(userId, traits) {},
  page(name, properties) {}
};
```

**重點**：
- 用 IIFE 包住內部實作避免污染
- public API 只暴露 4–5 個方法（init / track / identify / page）
- 不用 `window.AppierLayer.push(...)` 這種 array-based — 對 user 心智 cost 高（除非要支援 GA-style 載入 race）

### C2. Event batching + offline queue

```js
const queue = [];
let flushTimer;

function track(event) {
  queue.push({ ...event, ts: Date.now() });
  if (queue.length >= 10) flush();
  else scheduleFlush();
}

function scheduleFlush() {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, 2000); // 2s debounce
}

function flush() {
  if (!queue.length) return;
  const batch = queue.splice(0);
  // 用 Beacon API（unload 時也保證送出）
  navigator.sendBeacon('/track', JSON.stringify(batch))
    || fetch('/track', { method: 'POST', body: JSON.stringify(batch), keepalive: true });
}

window.addEventListener('beforeunload', flush);
```

**重點**：
- 條件 flush：滿 10 件 or 2 秒 → 平衡頻寬 + 延遲
- `sendBeacon` > `fetch keepalive`：sendBeacon 在 unload 時更可靠
- offline：可加 localStorage queue，下次 init 時 replay（但要 dedup）

### C3. Privacy / consent

- Cookie consent：init 前讀 consent state（GDPR）
- 不存 PII：userId 用 hash 不存 email
- DNT header：respect `navigator.doNotTrack`

---

## 練手感（D-day 前 24h）

如果 take-home 出在 R2 排程確認後，主題很可能是「做一個可嵌入的 widget / SDK」或「做 micro-frontend integration POC」。

**建議練習**：
1. **小 SDK demo**：寫一個 50 行的 `appier-mini.js` — 載入 + track + batch flush，部署在 GitHub Pages
2. **iframe widget demo**：寫一個 iframe widget + 父頁 postMessage 雙向通訊（origin 驗證）
3. **Module Federation hello world**：兩個獨立 Vite app（host + remote），host 動態載入 remote component

每個 1–2 小時。take-home 出來時直接套經驗。

---

## R2 攻擊面 D：QA agent + Playwright blocking（lead R1 額外問到，R2 高機率 follow-up）

### D1. 常見 Playwright blocking 類型

| 類型 | 症狀 | 解法 |
|------|------|------|
| **Flaky timing** | 同一 test 有時過有時 fail | 避免 `waitForTimeout`，用 `expect(locator).toBeVisible()` 內建 auto-wait |
| **Race condition** | network response 比 UI render 慢 | `page.waitForResponse()` 鎖到具體 API |
| **Auth state 重設** | 每個 test 都要重新登入 | `storageState` 存一次 cookie + localStorage，後續 test reuse |
| **Parallel isolation** | 多 worker 互相污染 | 每 worker fresh context；DB seed 用唯一 prefix |
| **iframe 抓不到** | locator 找不到嵌入 widget 元素 | `page.frameLocator('iframe[name=...]').locator(...)` |
| **Shadow DOM** | Web Component 內元素 query 不到 | Playwright 預設可穿 shadow，但 closed shadow root 要靠 component 暴露 API |
| **Visual diff false positive** | 字體 / antialiasing 微差 | `toHaveScreenshot` 加 `maxDiffPixelRatio: 0.01` threshold |
| **Cross-origin frame** | 父頁測不到 iframe 內部 | 用 `frameLocator` + iframe 那邊 expose test API via postMessage |

### D2. QA agent specific blocking（我自己 K-Line 遇過的）

> 這題如果被問，**直接從 K-Line 真實 post-mortem 講**，比泛論強：

**Case 1：agent 不會自己 debug 失敗**
- 症狀：Playwright fail，agent 看到 stderr 就建議改 selector，但 root cause 是上一個 ticket 的 race condition
- 解：harness rule 規定 QA agent fail → 必須 trace network log + 截圖，不能只看 stderr 就動 selector
- 對應 K-Line rule：`feedback_find_top_matches_test_fixture_min_index.md`（test fixture 不夠 robust）

**Case 2：agent 寫 test 過度依賴 implementation detail**
- 症狀：refactor 後 30+ test 全紅，其實功能沒壞，只是 class name 或 DOM 結構改了
- 解：強制用 `data-testid` selector，不准用 class / nth-child / xpath
- 對應 K-Line rule：Shared-Component Consistency Gate

**Case 3：跨 ticket test 互相影響**
- 症狀：QA agent 跑 ticket B 時，ticket A 留下的 Firestore seed 干擾
- 解：每個 ticket fresh DB collection prefix；test teardown 強制清理
- 對應 K-Line rule：QA Early Consultation（PM 在 release Engineer 前先過 QA 確認 test isolation）

**Case 4：visual regression noise**
- 症狀：CI 機器跟本地字體 render 不同，screenshot diff 永遠 fail
- 解：snapshot 跑在 Docker 統一環境，threshold 設 `maxDiffPixelRatio: 0.01`

### D3. 30 秒口答模板（如果 R2 沒太多時間）

> 「遇過 4 種主要 blocking：flaky timing 用 auto-wait 解、auth 用 storageState reuse、iframe 用 frameLocator、visual diff 跑 Docker 統一環境。我 K-Line 的 QA agent 還多一層問題：agent 看到 stderr 就改 selector 不查根因，所以我寫了 harness rule 規定 fail 必須先 trace network log。」

→ 一句話內塞「真實 blocking + 真實解法 + 自己 codify 成 rule」三層，直接命中 lead 想聽的 tech-lead 思考。

---

## Agent collaborate 場景準備

如果 R2 是 agent collaborate format：

**你已經有的 asset**
- K-Line multi-agent pipeline（PM/Architect/Engineer/Reviewer/QA/Designer 六角）
- 246 條 harness rules（每條都有真實 post-mortem 來源）
- Content-Alignment Gate / Pre-Design Dry-Run / Shared-Component Consistency 都是可講的 case

**Live demo 時要 show**
1. 給 agent 清楚 spec（不只是 "build this"）
2. 邊跑邊講 handoff design（為什麼 PM 不直接放給 Engineer）
3. agent 跑錯時的 recovery（你怎麼介入修 prompt / harness rule）

**不要 show**
- 一鍵讓 agent 自跑（lead 想看你的 judgment，不是 agent 的 magic）
- 過度依賴 agent（你還是要能讀 diff、提出方向）

---

## 二面前要做的 LinkedIn 偵察

R1 lead 是女性 Frontend tech lead — 二面排程 confirm 後：
- LinkedIn search「Appier + Frontend Lead/Manager + female」narrow down
- 找 mutual connection 看評價
- 看她 publication / talk 預判技術品味（pragmatic / academic / system-design heavy）

---

## 參考來源

- [Webpack Module Federation](https://webpack.js.org/concepts/module-federation/)
- [MDN postMessage](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage)
- [iframe sandbox attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/iframe#sandbox)
- [Navigator.sendBeacon](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/sendBeacon)
- [single-spa vs Module Federation](https://single-spa.js.org/docs/recommended-setup)
