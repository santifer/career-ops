# Newgrad-Jobs Research Prompt

下面这段 prompt 可以直接交给另一个 agent，用来研究 `https://www.newgrad-jobs.com/` 的页面流和最适合接入当前 career-ops extension 的方案。

---

## Prompt A — 研究与方案设计

你在当前 `career-ops` 仓库里工作。你的任务不是泛泛分析招聘网站，而是为当前项目设计一个可落地的 `newgrad-jobs.com -> jobright.ai -> Original Job Post` 研究与筛选流程，让 agent 能帮候选人高效发现“适合我”的岗位。

### 目标

请研究 `https://www.newgrad-jobs.com/` 的真实使用流，并产出一个适合当前仓库架构的方案，重点回答：

1. `newgrad-jobs` 列表页能稳定提取哪些字段。
2. `newgrad-jobs` 站内详情页能补充哪些结构化信息。
3. `Apply Now` 跳转到 `jobright.ai` 后，哪些信息值得读取，哪些不值得为了 token 和复杂度去抓。
4. 什么时候必须再进入 `Original Job Post`，什么时候不需要。
5. 如何基于当前 extension/content-script 架构实现，而不是新起一套 Playwright 爬虫。

### 已知事实

- `newgrad-jobs` 列表页常见字段包括：
  - `Position Title`
  - `Date`
  - `Work Model`
  - `Location`
  - `Company`
  - `Salary`
  - `Company Size`
  - `Company Industry`
  - `Qualifications`
  - `H1b Sponsored`
  - `Is New Grad`
- `newgrad-jobs` 详情页会展示整理后的 JD 摘要、职责、资格、福利、公司信息。
- `newgrad-jobs` 的 `Apply Now` 会跳到 `jobright.ai`。
- `jobright.ai` 的页面上通常会出现：
  - `GOOD MATCH`
  - `Exp. Level`
  - `Skill`
  - `Industry Exp.`
  - `Original Job Post`
- 真正的最终事实源是公司原始招聘页，不是 `newgrad-jobs`，也不是 `jobright.ai`。

### 重要约束

- 优先复用现有仓库和现有架构。
- 先读这些文件再给结论：
  - `CLAUDE.md`
  - `docs/CODEX.md`
  - `modes/scan.md`
  - `modes/apply.md`
  - `extension/src/content/extract.ts`
  - `extension/src/background/index.ts`
  - `bridge/src/contracts/jobs.ts`
- 不要设计新的通用爬虫层。
- 不要默认用 Playwright 批量扫站。只有在当前架构明显做不到时，才把 Playwright 作为少量 fallback。
- 优先使用 Chrome extension 的 content script / active tab capture / DOM extraction。
- 不要提供任何绕过风控、隐藏身份、规避封禁、绕过验证码、伪装指纹、代理池轮换之类的方案。
- 只能给出“合规、低频、用户驱动、最小请求量”的操作建议。
- 永远不要自动替用户提交申请。

### 候选人画像

请按这个候选人画像设计筛选逻辑：

- Name: Hongxi Chen
- Primary targets:
  - Software Engineer
  - Full-Stack Engineer
  - AI Engineer
- Strong fits:
  - Applied AI Engineer
  - AI Backend / Platform Engineer
  - Founding / Startup Full-Stack Engineer
  - Agent Infrastructure Engineer
  - Backend / Distributed Systems
  - Forward Deployed / Solutions Engineer (AI)
- Headline:
  - Backend-first engineer who builds AI systems that are actually deployable
- Strengths:
  - full-stack AI systems
  - distributed systems and backend engineering
  - fast prototyping with product sense
  - API integrations and workflow automation
- Work authorization:
  - requires sponsorship / work authorization support
- Location preference:
  - remote, hybrid, or strong on-site opportunities are all acceptable

### 你要产出的内容

请输出一份高信号设计说明，必须包含以下部分：

#### 1. 页面分层模型

把流程拆成清晰层级，并说明每层的职责、价值、风险、是否值得抓：

- Layer 1: `newgrad-jobs` 列表页
- Layer 2: `newgrad-jobs` 详情页
- Layer 3: `jobright.ai`
- Layer 4: `Original Job Post`

#### 2. 最小可用状态机

请明确推荐一个最小状态机，格式类似：

`list_scan -> row_rank -> detail_enrich -> rerank -> jobright_check -> human_review -> original_post -> manual_submit`

并解释：

- 哪一步只做 DOM 读取
- 哪一步允许点击
- 哪一步必须人工确认
- 哪一步的数据应进入现有 `pipeline` / `report` / `tracker`

#### 3. 字段提取规范

请给出每层建议抓取的字段清单，至少覆盖：

- canonical_url
- source_host
- source_layer
- title
- company
- location
- work_model
- salary
- company_size
- company_industry
- date_posted
- h1b_sponsored
- is_new_grad
- responsibilities
- qualifications
- preferred_qualifications
- benefits
- jobright_good_match
- jobright_exp_level
- jobright_skill_match
- jobright_industry_exp
- original_post_url

并注明：

- 必填字段
- 可选字段
- 哪些字段适合在列表层抓
- 哪些字段只应在高分岗位上补抓

#### 4. 排名规则

请给出一版适合这个候选人的排序公式，必须体现：

- 角色方向优先级
- `Is New Grad`
- sponsorship
- 技能命中
- remote/hybrid 偏好
- 发布时间新鲜度
- 薪资透明度
- Jobright 的 match 分数只能当辅助信号，不能当最终真相

要求输出：

- 一版可读规则
- 一版 JSON-like 权重草案

#### 5. 站点适配策略

请给出 `newgrad-jobs` 和 `jobright.ai` 的站点适配策略：

- 如何先判断当前页面属于哪一层
- 应该优先依赖哪些语义锚点
- 如何避免 brittle selector
- 如果 DOM 结构变化，fallback 顺序是什么

优先使用：

- host
- 页面可见文本
- heading
- button / link 文本
- label-value pairing

避免默认依赖：

- nth-child
- 深层 class hash
- 一长串 Tailwind class

#### 6. 与当前仓库的接入建议

请明确指出你建议修改哪些文件，以及为什么：

- `extension/src/content/extract.ts`
- `extension/src/background/index.ts`
- `modes/scan.md`
- `modes/apply.md`
- 其他你认为必要的文件

但不要真的改代码，先只给方案。

#### 7. 风险控制

给出合规、低风险建议，只能包含下面这类内容：

- 只在用户主动打开的页面上读 DOM
- 不并发批量打开大量岗位详情
- 不自动持续点击 `Apply Now`
- 只对高分岗位进入下一层
- 对同一 host 做节流和去重
- 保留人工确认环节

明确不要给出：

- 指纹伪装
- 代理池
- captcha 绕过
- stealth automation
- rate-limit 绕过

#### 8. 最终建议

最后请明确回答：

1. 这个功能最适合先做“研究模式”还是直接做“全自动模式”。
2. 当前阶段最值得先支持的页面是哪一层。
3. 哪些动作一定要人工保留。

### 输出要求

- 用中文输出。
- 先给结论，再给结构化分析。
- 不要空谈“可以”“也许”，尽量给明确取舍。
- 如果你需要引用仓库中的现有实现，请给文件路径。
- 如果你发现当前仓库已经有部分能力，明确指出“可复用”和“缺失项”。

---

## Prompt B — 偏实现的版本

如果你希望另一个 agent 在研究后直接进入实现准备，可以改用下面这版：

你在当前 `career-ops` 仓库里工作。请先研究 `https://www.newgrad-jobs.com/` 与 `jobright.ai` 的页面层级和信息流，再为当前 Chrome extension + bridge 架构提出“最小可实现版本”的技术设计。

重点不是通用爬虫，而是：

1. 让 extension 在用户浏览 `newgrad-jobs` 列表页时，能读取列表行并做第一轮粗筛。
2. 让 extension 在用户打开 `newgrad-jobs` 详情页时，能抽取结构化 JD 摘要。
3. 让 extension 在用户只对高分岗位点击 `Apply Now` 后，读取 `jobright.ai` 的辅助匹配信息。
4. 让 agent 在必要时把 `Original Job Post` 标记为最终核验入口。

约束：

- 不要用 Playwright 做批量扫站。
- 不要实现自动投递。
- 不要给出绕过平台检测或封禁的建议。
- 优先复用 `extension/src/content/extract.ts` 和 `captureActiveTab` 现有模式。
- 只设计“用户在前台浏览时，extension 读取当前页面 DOM”的方案。

你必须输出：

1. 页面类型判定规则
2. 每种页面的字段提取 schema
3. 推荐的数据流
4. 最小改动文件列表
5. 分阶段实施计划
6. 明确的非目标列表

分阶段实施计划请至少拆成：

- Phase 1: list page capture + rank
- Phase 2: detail page enrich
- Phase 3: jobright auxiliary signals
- Phase 4: original post handoff

非目标必须包括：

- auto-submit
- stealth scraping
- parallel crawling
- captcha handling
- bypassing site protections

如果你认为应该把一些用户偏好写入 profile，请只建议写到：

- `config/profile.yml`
- `modes/_profile.md`
- `data/*`

不要建议把用户特定偏好写进 `modes/_shared.md`。
