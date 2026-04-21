import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

/**
 * Basic YAML parser for config/profile.yml to get Obsidian path
 */
function getObsidianPath() {
  const profilePath = path.join(projectRoot, 'config', 'profile.yml');
  if (!fs.existsSync(profilePath)) return null;
  const content = fs.readFileSync(profilePath, 'utf8');
  const vaultPath = content.match(/vault_path:\s*"([^"]+)"/);
  return vaultPath ? vaultPath[1] : null;
}

/**
 * Convert JSON history to Markdown
 */
function jsonToMarkdown(historyJson) {
  let md = `# Gemini Dev Session: ${historyJson.id}\n`;
  md += `> Date: ${new Date(historyJson.startTime).toLocaleString()}\n\n---\n\n`;

  for (const turn of (historyJson.turns || [])) {
    if (turn.role === 'user') {
      md += `### 👤 User\n${turn.content}\n\n`;
    } else if (turn.role === 'assistant') {
      md += `### 🤖 Gemini\n${turn.content}\n\n`;
      // If there were tool calls, we can list them briefly
      if (turn.toolCalls && turn.toolCalls.length > 0) {
        md += `> 🛠️ **Tools used**: ${turn.toolCalls.map(tc => tc.name).join(', ')}\n\n`;
      }
    }
    md += `---\n\n`;
  }
  return md;
}

async function exportWiki() {
  console.log('--- 正在导出 Gemini 协作开发 Wiki ---');
  
  const vaultPath = getObsidianPath();
  if (!vaultPath) {
    console.error('未在 profile.yml 中找到 Obsidian 库路径，请先配置 vault_path');
    return;
  }

  const wikiFolder = path.join(vaultPath, 'Gemini_Dev_Notes');
  if (!fs.existsSync(wikiFolder)) {
    fs.mkdirSync(wikiFolder, { recursive: true });
  }

  // Gemini CLI 默认历史路径
  const historyDir = path.join(os.homedir(), '.gemini', 'history');
  if (!fs.existsSync(historyDir)) {
    console.error('未找到 Gemini 历史记录目录');
    return;
  }

  const files = fs.readdirSync(historyDir).filter(f => f.endsWith('.json'));
  let exportCount = 0;

  for (const file of files) {
    try {
      const history = JSON.parse(fs.readFileSync(path.join(historyDir, file), 'utf8'));
      const fileName = `Session-${history.id.slice(0, 8)}-${new Date(history.startTime).toISOString().split('T')[0]}.md`;
      const targetFile = path.join(wikiFolder, fileName);

      if (!fs.existsSync(targetFile)) {
        const markdown = jsonToMarkdown(history);
        // Add YAML frontmatter for Obsidian
        const finalContent = `---\nid: ${history.id}\ntype: dev-log\ntags: [gemini-cli, career-ops-cn]\ndate: ${new Date(history.startTime).toISOString()}\n---\n\n${markdown}`;
        
        fs.writeFileSync(targetFile, finalContent, 'utf8');
        console.log(`已导出: ${fileName}`);
        exportCount++;
      }
    } catch (e) {
      // Skip broken files
    }
  }

  console.log(`--- 导出完成！共新增 ${exportCount} 篇笔记到 Obsidian ---`);
}

exportWiki();
