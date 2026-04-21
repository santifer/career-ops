import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

/**
 * Simple YAML parser for config/profile.yml
 */
function parseProfile() {
  const profilePath = path.join(projectRoot, 'config', 'profile.yml');
  if (!fs.existsSync(profilePath)) return null;
  const content = fs.readFileSync(profilePath, 'utf8');
  
  const config = {
    integrations: {
      wecom: { enabled: false, webhook_url: '' },
      obsidian: { enabled: false, vault_path: '', folder_name: '' }
    }
  };

  // Basic regex matching for the integration fields
  const wecomEnabled = content.match(/wecom:\s*\n\s+enabled:\s*(true|false)/);
  if (wecomEnabled) config.integrations.wecom.enabled = wecomEnabled[1] === 'true';
  
  const wecomWebhook = content.match(/webhook_url:\s*"([^"]+)"/);
  if (wecomWebhook) config.integrations.wecom.webhook_url = wecomWebhook[1];

  return config;
}

export async function sendWeComMessage(text) {
  const config = parseProfile();
  if (!config?.integrations?.wecom?.enabled || !config?.integrations?.wecom?.webhook_url) {
    console.log('企业微信通知未启用或未配置 Webhook URL');
    return;
  }

  if (config.integrations.wecom.webhook_url.includes('YOUR_KEY')) {
    console.log('请先在 config/profile.yml 中配置正确的企业微信 Webhook URL');
    return;
  }

  try {
    const response = await fetch(config.integrations.wecom.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msgtype: 'markdown',
        markdown: {
          content: text
        }
      })
    });
    const result = await response.json();
    if (result.errcode === 0) {
      console.log('企业微信通知发送成功');
    } else {
      console.error('企业微信通知发送失败:', result.errmsg);
    }
  } catch (error) {
    console.error('企业微信通知请求出错:', error.message);
  }
}

// If run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const testMsg = `### Career-Ops-CN 每日扫描报告\n- **测试消息**: 机器人连接正常\n- **时间**: ${new Date().toLocaleString()}`;
  sendWeComMessage(testMsg);
}
