# Mode: interview/plan — 面试准备计划器

给定职位描述（JD）和面试日期/时间，构建一份结构化、按时间分块的准备计划，针对候选人的具体短板量身定制。

---

## Inputs

1. **职位描述**（必填）— 内联粘贴或提供 URL
2. **面试日期与时间**（必填）— 用于计算可用小时数
3. **面试官姓名与角色**（如已知）— 影响准备的深度与语气。后续轮次（panel / onsite loop）常会一次点名多位面试官——来自用户直接告知、粘贴的日历邀请，或粘贴的排期邮件。当点名超过一位小组成员时，见 Step 2 中的 Panel Intel 说明。
4. **轮次类型**（如已知）— screening、technical/domain-specific、design/case study、behavioral panel
5. **简历**，位于 `cv.md` + `article-digest.md`（如存在）— 读取经验、技能与证明点
6. **画像**，位于 `config/profile.yml` + `modes/_profile.md` — 读取叙事、原型与目标
7. **故事库**，位于 `interview-prep/story-bank.md` — 已有的 STAR+R 故事
8. **题库**，位于 `interview-prep/question-bank.md` — 已有短板（如文件存在）
9. **此前已表态的薪酬** — 若已知 tracker#，运行 `node salary-gap.mjs --stated-for <tracker#>`（零 token）。任何先前的 `stated` 观察值，都是候选人在更早一轮、对某位具体面试官已经承诺过的数字——把它写入 Step 4 的速查页，让候选人保持口径一致，避免无意中重新谈价。

---

## Step 1 — Fit Assessment

阅读简历与 JD。产出两列评估：

**可锚定的优势：** 与 JD 直接匹配的经验、头衔、领域与证明点。

**需补齐的短板：** JD 点名但简历中缺失或偏弱的技能、工具或经验。按在本轮类型中被考察的可能性排序。

要诚实。短板就是短板——标清楚，好把准备时间花在刀刃上。

---

## Step 2 — Round Intelligence

根据以下信号判断本轮真正在评估什么：
- 面试官角色（manager = 沟通 + 热情 + 基本功；practitioner = 深度 + 判断力）
- 轮次标签（screening、technical/domain、design/case study、final）
- JD 信号（他们强调什么）

**Recruiter screen：**
- 勾选式核对：匹配度、薪酬对齐、后勤、沟通
- 不是技术测试——深度问题在 HM 及后续轮次才会出现
- 常见：背景介绍、"为什么选我们/为什么这个岗位"、薪酬预期、时间线、一个后勤问题
- 把它当作轻松的检查点；把准备时间用来打好后续轮次的基础

**Hiring-manager screen：**
- 沟通、热情、匹配——外加领导力哲学与判断力
- JD 核心技能的基本面——不是深层内部细节
- 1–2 个行为故事
- 常见：背景、"为什么选我们"、一个来自 JD 的核心概念、一个领导力故事、面向未来的情境题

**Technical / domain deep-dive with a practitioner：**
- 对 JD 核心技能的深度（例如工程的 runtime internals、数据的建模选择、金融的估值方法）
- 来自岗位日常的应用场景
- 可能有现场练习或带练走读
- 故事用作证据，不是主菜

**Design / case study panel：**
- 完整方案——约束、组件、权衡、失效模式
- JD 强调的质量维度（例如可扩展性、合规、可度量性）
- 高级别：设定约束、提出澄清问题、主导对话

按轮次校准计划。为 screening 过度准备深度既浪费时间，也会带错心态。

**Panel Intel（当点名了小组成员时）。** 若本轮点名了两位及以上面试官——来自用户直接告知、粘贴的日历邀请，或粘贴的排期邮件——在进入 Step 3 之前先建好 Panel Intel 表。完整表格格式与三个子行为（按 JD 汇报线做决策者加权、读职业轨迹信号、为每位小组成员定制收尾问题）见 `modes/interview-prep.md` § "Panel Intel table"（在 Step 4 → `panel-mixed` 下）——此处沿用同一逻辑，再用得到的受众标签按面试官拆分 Step 3 的时间块，而不是准备一份通吃的材料。只点名一位面试官时不需要该表；直接按上文该人的轮次类型进入 Step 3。

---

## Step 3 — Build the Time-Blocked Plan

从现在到面试时间计算可用小时数，并划分成时间块：

在确定块大小之前，先检查 `interview-prep/question-bank.md`（如存在）。任何来自先前轮次、标为 🔴 的题都是已被证实的短板——无论 CV-vs-JD 分析如何排序，都要给它单独一块。真实表现数据优先于推断风险。

**模板（按可用总时长调整各块大小）：**

```text
Block 1 — Lock your narrative (first, always)
  - Write out your background timeline explicitly
  - Prepare "why this company" with a specific connection to your history
  - Prepare your strongest proof point story (30-second version)
  - Time: ~15% of available hours

Block 2 — Priority domain topic (highest-risk gap first)
  - One topic per block — don't mix
  - For each: concept → your story hook → likely follow-up questions
  - Time: ~25% of available hours

Block 3 — Secondary domain topic
  - Second-highest-risk gap
  - Time: ~20% of available hours

Block 4 — Behavioral stories
  - Map existing stories to likely question types
  - Practice the 2-minute verbal version of each
  - Prepare the Reflection for each — the senior-candidate differentiator
  - Time: ~15% of available hours

Block 5 — Company research
  - Product pages relevant to the role
  - Connection between your history and their specific domain
  - 3–4 sharp questions to ask them
  - Time: ~10% of available hours

Block 6 — Practice run (if time permits)
  - One question per likely topic — out loud, timed
  - Time: ~10% of available hours

Block 7 — Buffer + rest
  - Stop studying 60–90 minutes before the interview
  - Cramming in the last hour adds noise, not signal
  - Time: remaining
```

按短板严重程度与轮次类型调整块大小。若是 screening，Block 4（行为）与 Block 5（公司调研）比深层领域块更重要。

---

## Step 4 — Priority Quick-Reference

在计划末尾产出一页速查，供候选人在面试前 15 分钟快速浏览：

```markdown
## 15-Minute Pre-Interview Review

**Your anchor sentence:** [one sentence that captures why you're right for this role]

**Top 3 things to remember:**
1. [most important message to leave the interviewer with]
2. [most likely question and your first sentence of the answer]
3. [the connection between your history and their domain]

**Compensation — already discussed:** [only if `--stated-for` returned prior observations] "You stated {amount} {currency} to {interviewer} on {date} in {round}. Stay consistent unless something material changed." Omit this block entirely if there are no prior `stated` observations for this tracker# — don't invent a number that was never said.

**Your questions to ask:**
1. [question 1]
2. [question 2]
3. [question 3]
```

---

## Step 5 — Save Output

若文件不存在，将计划保存到 `interview-prep/{company-slug}-{role-slug}.md`；若已存在，则追加一个 `## Prep Plan` 小节。

---

## Rules

- **按轮次校准。** screening 准备计划与 design-panel 准备计划差异很大。不要默认每场面试都上最大深度。
- **短板优先。** 时间有限。候选人的优势不需要准备——短板才需要。
- **题库里的 🔴 短板优先于推断短板。** 真实表现数据胜过 CV-vs-JD 分析。若候选人已知自己某题吃力，不要把它埋掉。
- **一块一个主题。** 单块混多个主题会降低记忆留存。
- **始终留出休息时间。** 休息好的候选人比临时抱佛脚的表现更好。
- **绝不编造公司情报。** 若没有调研，就直说——不要捏造公司文化或技术细节。
- **绝不替候选人编造主张。** 速查页（Step 4）中的锚定句与面试前话术，必须 grounded 在候选人实际拥有的材料上——`cv.md`、`article-digest.md` 或故事库。不要起草依赖候选人没有的经验或指标的主张。若某主张出现在 `interview-prep/retracted-claims.md` 中，永远不要纳入。
