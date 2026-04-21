# 项目更新日志 (Career-Ops-CN)

## 2026-04-21

### 1. 系统核心升级
- **版本更新**: 从 v1.2.0 升级至 v1.3.0，同步了上游最新的评估模式和底层脚本。
- **环境优化**: 完成了 `playwright chromium` 的安装与配置，确保 PDF 生成和活性检查功能可用。

### 2. 扫描器与抓取优化 (针对中国市场)
- **URL 标准化**: 修复了 BOSS 直聘链接抓取不一致的问题。现在会自动将移动端链接 (`m.zhipin.com`) 强制转换为 PC Web 端链接 (`www.zhipin.com`)，并移除多余的查询参数，确保链接稳定性。
- **活性检查增强**: 升级了 `check-liveness.mjs`，加入了针对 BOSS 直聘和猎聘的下架关键词检测（如“该职位已关闭”、“停止招聘”等），并增加了 Cookie 鉴权支持，减少误判。
- **自动化流程集成**: 在 `daily-sync.mjs` 中集成了实时的活性检查逻辑。现在系统在调用 LLM 进行评估前，会先确认职位是否存活，从而节省 API Token 消耗。

### 3. 协作开发 Wiki 自动导出 (Karpathy 模式)
- **新增脚本**: 创建了 `scripts/export-wiki.mjs`，可自动读取 Gemini CLI 的历史记录并将其转换为带有 YAML 元数据的 Markdown 文件。
- **Obsidian 深度集成**: 笔记会自动同步到 `profile.yml` 中配置的 Obsidian 库路径下的 `Gemini_Dev_Notes` 文件夹。
- **全自动化**: 已将 Wiki 导出逻辑集成进 `daily-sync.mjs`。每天同步任务完成后，昨天的开发脑暴记录将自动出现在 Obsidian 中。

### 4. 反爬突破尝试
- **save-cookies.mjs 优化**: 尝试通过调用系统安装的真实 Google Chrome 浏览器及注入更高级的隐身参数来绕过 BOSS 直聘的自动化检测。

---
*记录人: Gemini CLI*
