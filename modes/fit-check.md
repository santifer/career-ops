# Mode: fit-check — 投遞前適配確認

正式投遞前，根據職缺評估報告自動生成確認清單，確認硬條件與部門狀況，避免在不符合底線的職缺上浪費面試時間。

## 使用時機

- 拿到內推機會，要請對方協助問資訊之前
- Recruiter 第一通電話前，整理自己要確認的問題
- 任何正式投遞前，確認是否符合自身底線

## Workflow

```
1. 讀報告   → 從 reports/ 找到對應評估報告
2. 提取條件 → 從 Block A、D 取出硬條件（薪資目標、遠端政策）
3. 生成清單 → 硬門檻 → 部門狀況 → 工作內容 → 決策邏輯
4. 存檔     → 儲存至 reports/{###}-{company}-fit-check.md
5. 更新追蹤 → 確認 applications.md 狀態是否需要更新
```

## Step 1 — 找報告

用 applications tracker 或使用者提供的 `#` 編號找到對應報告：

```
reports/{###}-{company}-{date}.md
```

若使用者只說公司名 → Grep `reports/` 找最新的匹配報告。

## Step 2 — 提取硬條件

從報告中提取以下資訊：

| 欄位 | 來源 | 說明 |
|------|------|------|
| 薪資目標 / 底線 | Block D（Compensation）| 找 "candidate target" 或 "minimum" |
| 遠端政策 | Block A（Role Summary）| Remote / Hybrid / Onsite |
| 職缺分數 | Score Summary | 整體評分 |
| 主要 Gap | Block B（CV Match）| ⚠️ 或 ❌ 項目 |

## Step 3 — 生成清單

依照以下模板，將提取的數字代入 `{{}}` 欄位：

```markdown
# {Company} — {Role}
## 投遞前確認清單

**職缺：** {JD ID}
**狀態：** {Status}（e.g., 內推中、自行投遞）

---

## 硬門檻（任一不符則放棄）

- [ ] **薪資 band：** 這個 role 的薪資範圍大概在哪個區間？
  - 目標：{salary_target}，底線：{salary_floor}
- [ ] **{Remote policy} 實際安排：** {具體問法，e.g., 一週幾天需要進辦公室？}
  - 需確認是否可接受

---

## 部門狀況

- [ ] 這個職缺是新 headcount 還是補缺（前任離職）？
- [ ] {Business unit} 這個業務單位目前狀況如何？擴編還是縮編？
- [ ] Team 最近有沒有 reorg 或人事異動？

---

## 工作內容與環境

- [ ] 這個 role 主要跟誰協作？{台灣 team 還是其他 team？}
  {若跨時區：- 若主要對接 {region}：時區 overlap 要求是什麼？}
- [ ] Onboarding 後主要負責哪個產品方向？

---

## 同事視角（有內部聯絡人再問）

- [ ] Team 文化和工作步調如何？壓力大嗎？
- [ ] PM / 跨部門協作順不順？
- [ ] Manager 風格如何？
- [ ] Codebase 狀況和技術債嚴不嚴重？

---

## 決策邏輯

\`\`\`
薪資 ≥ {salary_floor}
  → {Remote condition} 可接受
    → 部門穩定
      → 投遞
    → 部門不穩定 → 審慎考慮
  → {Remote condition} 不可接受 → 放棄
→ 薪資不符 → 放棄
\`\`\`
```

### 客製化規則

**薪資欄位：**
- 若報告有明確底線（e.g., "minimum NTD 2M"）→ 直接填入
- 若報告只有目標無底線 → 以目標的 80% 作為底線，並標注「估計」

**遠端政策欄位：**
- Remote → 移除該硬門檻（不是障礙）
- Hybrid → 保留，問清楚幾天
- Onsite → 保留，確認通勤可接受性

**同事視角 section：**
- 有內推或內部聯絡人 → 保留此 section
- 完全自行投遞、無任何內部聯絡 → 移除此 section

**時區欄位：**
- 若 Block A 顯示需與海外 team 協作 → 保留時區那行
- 否則 → 移除

## Step 4 — 存檔

儲存至：
```
reports/{###}-{company}-fit-check.md
```

`###` 與評估報告相同（同一職缺共用編號）。

## Step 5 — 更新追蹤（選用）

若使用者狀態有變更（e.g., 剛拿到內推）→ 更新 `applications.md` 的 Status 欄位。

## Output 格式

完成後回報：
```
✅ Fit-check 已生成：reports/{###}-{company}-fit-check.md

硬門檻摘要：
- 薪資底線：{salary_floor}
- 遠端政策：{policy}
- 整體評分：{score}/5
```
