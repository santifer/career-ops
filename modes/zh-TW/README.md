# career-ops -- 繁體中文模式 (`modes/zh-TW/`)

此資料夾包含 career-ops 主要模式的繁體中文翻譯，專為以台灣市場或繁體中文環境求職的候選人設計。

## 何時使用這些模式？

符合以下任一條件時，請使用 `modes/zh-TW/`：

- 你主要投遞**台灣的職缺**（104 人力銀行、1111 人力銀行、CakeResume、Yourator、Meet.jobs、LinkedIn TW、Indeed TW、JECHO 等）
- 你的**履歷語言**是繁體中文，或者依職缺需要在中文與英文之間切換
- 你需要以**自然的台灣科技業用語**撰寫回答與求職信，而非機器翻譯
- 你需要處理**台灣市場特有事項**：勞基法、勞退新制（6%）、勞健保、特休假、試用期、加班費、年終獎金、三節獎金、員工認股權、責任制（84-1 條）、競業禁止條款等

如果大部分職缺以英文為主，請使用預設的 `modes/`。英文模式也能處理台灣職缺，但對台灣市場的細節掌握不及這些模式。

## 如何啟用？

career-ops 沒有程式碼層面的「語言切換」。有兩種方式啟用：

### 方式一 -- 單次工作階段指定

在工作階段開頭告訴 Claude：

> 「使用 `modes/zh-TW/` 的繁體中文模式。」

或

> 「用繁體中文評估和投遞。讀取 `modes/zh-TW/_shared.md` 和 `modes/zh-TW/zhaopin.md`。」

Claude 會讀取此資料夾的檔案，而非 `modes/`。

### 方式二 -- 永久設定

在 `config/profile.yml` 加入語言設定：

```yaml
language:
  primary: zh-TW
  modes_dir: modes/zh-TW
```

第一次工作階段時提醒 Claude（「看一下 `profile.yml`，我已設定 `language.modes_dir`」）。之後 Claude 會自動使用繁體中文模式。

> 注意：`language.modes_dir` 是慣例而非嚴格 schema。此欄位名稱日後可能變更。

## 翻譯了哪些模式？

這個初始版本涵蓋四個影響最大的模式：

| 檔案 | 翻譯來源 | 用途 |
|------|---------|------|
| `_shared.md` | `modes/_shared.md` (EN) | 共用脈絡、人才定位、全域規則、台灣市場特殊事項 |
| `zhaopin.md` | `modes/oferta.md` (ES) | 職缺完整評估（A-F 區塊） |
| `toudi.md` | `modes/apply.md` (EN) | 投遞表單填寫的即時助手 |
| `pipeline.md` | `modes/pipeline.md` (ES) | URL 收件匣 / 職缺 Second Brain |

其餘模式（`scan`、`batch`、`pdf`、`tracker`、`auto-pipeline`、`deep`、`contacto`、`ofertas`、`project`、`training`）刻意未納入。它們主要由工具管線、路徑和設定指令組成，應保持語言無關。

如果社群採用繁體中文模式，後續 PR 將翻譯更多模式。

## 保留英文的部分

以下刻意不翻譯，因為它們是標準科技術語：

- `cv.md`、`pipeline`、`tracker`、`report`、`score`、`archetype`、`proof point`
- 工具名稱（`Playwright`、`WebSearch`、`WebFetch`、`Read`、`Write`、`Edit`、`Bash`）
- tracker 的狀態值（`Evaluated`、`Applied`、`Interview`、`Offer`、`Rejected`）
- 程式碼片段、檔案路徑、指令

模式使用台灣科技業自然慣用的繁體中文表達：正文以中文書寫，已被業界接受的科技術語維持英文。不會把「pipeline」翻成「管線」，也不會把「cv.md」改成「履歷.md」。

## 參考詞彙表

擴充或修改模式時，請參考此詞彙表以保持語調一致：

| 英文 | 繁體中文（本 codebase 使用） |
|-----|---------------------------|
| Job posting | 職缺 / 工作機會 / 職位描述 |
| Application | 投遞 / 應徵 |
| Cover letter | 求職信 / 自我推薦信 |
| Resume / CV | 履歷 / 履歷表 |
| Salary | 薪資 / 薪水 |
| Compensation | 薪酬 / 待遇 |
| Skills | 技能 |
| Interview | 面試 |
| Hiring manager | 用人主管 / Hiring manager |
| Recruiter | 招募人員 / HR |
| AI | AI（人工智慧） |
| Requirements | 必備條件 / 加分條件 |
| Career history | 工作經歷 |
| Notice period | 預告期 / 離職預告期 |
| Probation | 試用期 |
| Vacation | 特休假 / 年假 |
| Year-end bonus | 年終獎金 |
| Festival bonuses | 三節獎金（端午、中秋、春節） |
| Full-time employment | 正職 / 全職 |
| Contractor | 約聘 / 承攬 / 派遣 |
| Annual salary | 年薪 / 保障年薪 |
| Health insurance | 健保（全民健保） |
| Labor insurance | 勞保（勞工保險） |
| Labor pension | 勞退（勞工退休金） |
| Overtime pay | 加班費 |
| Exempt from overtime rules | 責任制（勞基法 84-1 條） |
| Stock options | 員工認股權 / ESOP |
| Restricted stock units | 限制型股票（RSU） |
| Non-compete clause | 競業禁止條款 |
| Meal allowance | 伙食津貼 |
| Transportation allowance | 交通津貼 |

## 貢獻方式

想改善翻譯或翻譯更多模式：

1. 依照 `CONTRIBUTING.md` 開 issue 提出建議
2. 遵循上方詞彙表以維持語調一致
3. 採用自然慣用的翻譯 -- 不要逐字直譯
4. 結構元素（A-F 區塊、表格、程式碼區塊、工具指示）必須與原文完全對應
5. 在提交 PR 前，用實際的台灣職缺（104、CakeResume、Yourator 等）測試
