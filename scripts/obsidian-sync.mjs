import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

/**
 * Basic YAML parser for config/profile.yml
 */
function parseProfile() {
  const profilePath = path.join(projectRoot, 'config', 'profile.yml');
  if (!fs.existsSync(profilePath)) return null;
  const content = fs.readFileSync(profilePath, 'utf8');
  
  const config = {
    integrations: {
      obsidian: { enabled: false, vault_path: '', folder_name: '' }
    }
  };

  const obsidianEnabled = content.match(/obsidian:\s*\n\s+enabled:\s*(true|false)/);
  if (obsidianEnabled) config.integrations.obsidian.enabled = obsidianEnabled[1] === 'true';
  
  const vaultPath = content.match(/vault_path:\s*"([^"]+)"/);
  if (vaultPath) config.integrations.obsidian.vault_path = vaultPath[1];

  const folderName = content.match(/folder_name:\s*"([^"]+)"/);
  if (folderName) config.integrations.obsidian.folder_name = folderName[1];

  return config;
}

export async function syncToObsidian(reportContent, fileName, metadata = {}) {
  const config = parseProfile();
  if (!config?.integrations?.obsidian?.enabled || !config?.integrations?.obsidian?.vault_path) {
    console.log('Obsidian 同步未启用或未配置库路径');
    return;
  }

  const vaultPath = config.integrations.obsidian.vault_path;
  const folderName = config.integrations.obsidian.folder_name || 'Career-Ops/Reports';
  const targetDir = path.join(vaultPath, folderName);

  try {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // 构建 YAML Frontmatter (Obsidian Properties)
    let yaml = '---\n';
    for (const [key, value] of Object.entries(metadata)) {
      yaml += `${key}: ${JSON.stringify(value)}\n`;
    }
    yaml += '---\n\n';

    const fullContent = yaml + reportContent;
    const targetFile = path.join(targetDir, fileName.endsWith('.md') ? fileName : `${fileName}.md`);
    fs.writeFileSync(targetFile, fullContent, 'utf8');
    console.log(`已成功将报告同步至 Obsidian: ${targetFile}`);
  } catch (error) {
    console.error('Obsidian 报告同步失败:', error.message);
  }
}

/**
 * 同步 PDF 文件到 Obsidian
 */
export async function syncPdfToObsidian(localPdfPath, fileName) {
  const config = parseProfile();
  if (!config?.integrations?.obsidian?.enabled || !config?.integrations?.obsidian?.vault_path) return null;

  const vaultPath = config.integrations.obsidian.vault_path;
  const pdfFolderName = "Career-Ops/Resumes"; // 专门存 PDF 的文件夹
  const targetDir = path.join(vaultPath, pdfFolderName);

  try {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const targetFile = path.join(targetDir, fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`);
    fs.copyFileSync(localPdfPath, targetFile);
    console.log(`已成功将 PDF 同步至 Obsidian: ${targetFile}`);
    
    // 返回相对路径，方便在 Obsidian 中引用 [[filename.pdf]]
    return `[[${pdfFolderName}/${path.basename(targetFile)}]]`;
  } catch (error) {
    console.error('Obsidian PDF 同步失败:', error.message);
    return null;
  }
}

/**
 * 同步简历 Markdown 文件到 Obsidian
 */
export async function syncResumeMarkdownToObsidian(mdContent, fileName) {
  const config = parseProfile();
  if (!config?.integrations?.obsidian?.enabled || !config?.integrations?.obsidian?.vault_path) return null;

  const vaultPath = config.integrations.obsidian.vault_path;
  const resumeFolderName = "Career-Ops/Resumes"; // 专门存简历的文件夹
  const targetDir = path.join(vaultPath, resumeFolderName);

  try {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const targetFile = path.join(targetDir, fileName.endsWith('.md') ? fileName : `${fileName}.md`);
    fs.writeFileSync(targetFile, mdContent, 'utf8');
    console.log(`已成功将简历同步至 Obsidian: ${targetFile}`);
    
    // 返回标准 Obsidian 双链格式 [[路径/文件名]]
    return `[[${resumeFolderName}/${path.basename(targetFile, '.md')}]]`;
  } catch (error) {
    console.error('Obsidian 简历同步失败:', error.message);
    return null;
  }
}
