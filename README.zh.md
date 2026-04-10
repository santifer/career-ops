# Career-Ops (中文版)

[English](README.md) | [Español](README.es.md) | [简体中文](README.zh.md)

<p align="center">
  <a href="https://x.com/santifer"><img src="docs/hero-banner.jpg" alt="Career-Ops — 多智能体求职自动化系统" width="800"></a>
</p>

<p align="center">
  <em>我曾花费数月用最笨的方法投递简历。所以我开发了这套我梦寐以求的系统。</em><br>
  公司使用 AI 来筛选候选人。<strong>我给候选人 AI 来<em>挑选</em>公司。</strong><br>
  <em>现在它已开源。</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Claude_Code-000?style=flat&logo=anthropic&logoColor=white" alt="Claude Code">
  <img src="https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/Playwright-2EAD33?style=flat&logo=playwright&logoColor=white" alt="Playwright">
  <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT">
  <br>
  <img src="https://img.shields.io/badge/ZH-red?style=flat" alt="ZH">
</p>

---

## 🚀 中文版特有功能

此版本针对 **中国招聘市场** 进行了深度适配：
- **BOSS直聘 (BOSS Zhipin)**: 支持捕获 Session Cookie 以绕过复杂的反爬虫验证。
- **猎聘 (Liepin)**: 支持注入 Cookie 自动抓取职位详情。
- **前程无忧 (51job)**: 预设国内主流平台扫描配置。
- **双语支持**: 配置文件（profile.yml, portals.yml）均附带中文注解。

### 快速开始 (国内平台)
```bash
# 捕获 BOSS直聘/猎聘 的登录状态
node save-cookies.mjs boss
node save-cookies.mjs liepin
```

---

## 这是什么

Career-Ops 将任何 AI 编程命令行转变为一个完整的求职指挥中心。不再需要手动在 Excel 中记录投递进度，你将获得一个 AI 驱动的流水线：

- **职位评估**: 使用结构化的 A-F 评分系统（10 个加权维度）。
- **生成定制化 PDF**: 根据职位描述（JD）自动优化 ATS 关键词并生成简历。
- **自动化扫描**: 自动扫描各大门户（BOSS、猎聘、公司官网等）。
- **批量处理**: 使用子智能体并行评估 10+ 个职位。
- **全局追踪**: 单一事实来源，具备数据完整性检查。

> **重要提示：这不是一个“海投”工具。** Career-ops 是一个过滤器——它帮助你从数百个职位中找出那几个真正值得你投入时间的。系统强烈建议不要投递评分低于 4.0/5 的职位。你的时间很宝贵，招聘官的时间也是。

---

## 核心功能

| 功能 | 描述 |
|---------|-------------|
| **自动流水线** | 粘贴 URL，获取完整评估 + 定制 PDF + 追踪记录 |
| **6 模块评估** | 角色总结、简历匹配、职级策略、薪酬研究、个性化方案、面试准备 (STAR+R) |
| **面试故事库** | 跨评估累积 STAR+Reflection 故事——5-10 个万能故事应对任何行为面试题 |
| **谈判脚本** | 薪资谈判框架、异地折扣对策、竞争 Offer 杠杆 |
| **ATS PDF 生成** | 注入关键词的简历，使用 Space Grotesk + DM Sans 设计 |
| **门户扫描** | 预设 45+ 全球名企 + 国内主流招聘平台查询 |
| **仪表盘 TUI** | 终端 UI 界面，用于浏览、过滤和排序你的求职流水线 |

---

## 快速上手

```bash
# 1. 克隆并安装
git clone https://github.com/santifer/career-ops.git
cd career-ops && npm install
npx playwright install chromium   # PDF 生成必备

# 2. 环境检查
npm run doctor                     # 验证所有先决条件

# 3. 配置个人信息
cp config/profile.example.yml config/profile.yml  # 编辑个人资料
cp templates/portals.example.yml portals.yml       # 自定义目标公司

# 4. 准备简历
# 在项目根目录创建 cv.md，放入你的 Markdown 格式简历

# 5. 开始使用
# 运行 AI Agent 并输入指令，例如：
# "帮我评估这个职位：[URL]"
# "/career-ops scan"
```

---

## 项目结构

- `cv.md`: 你的简历（单一事实来源）
- `config/profile.yml`: 个人画像与目标设定
- `data/`: 你的投递追踪数据 (已 gitignore)
- `reports/`: 职位评估报告 (已 gitignore)
- `output/`: 生成的定制简历 PDF (已 gitignore)
- `modes/`: 14 种智能体工作模式（评估、PDF、扫描等）
- `save-cookies.mjs`: 国内平台 Cookie 捕获工具

---

## 免责声明

**career-ops 是一个本地开源工具，并非托管服务。** 使用本软件即表示你知晓：
1. **隐私**: 你的所有数据（简历、报告、Cookie）均保存在本地。
2. **合规**: 请遵守各招聘平台的规则。本系统从不代表用户点击“投递”按钮——最终决定权始终在你手中。
