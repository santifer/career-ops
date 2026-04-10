import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

async function saveCookies(siteName, url) {
  const dataDir = path.join(process.cwd(), 'data', 'cookies');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const cookiePath = path.join(dataDir, `${siteName}.json`);

  console.log(`\n正在启动浏览器访问: ${url}`);
  console.log('--------------------------------------------------');
  console.log('1. 请在打开的浏览器窗口中完成登录。');
  console.log('2. 针对 BOSS 直聘：如果页面显示空白，请尝试手动在地址栏输入');
  console.log('   https://www.zhipin.com/ 并回车，或手动点击页面上的“刷新”。');
  console.log('3. 登录成功并进入主页后，回到终端（Terminal）。');
  console.log('4. 在终端中按 [回车键/Enter] 保存 Cookie 并关闭浏览器。');
  console.log('--------------------------------------------------\n');
  
  // 针对 BOSS 直聘：模拟更真实的浏览器环境
  const browser = await chromium.launch({ 
    headless: false,
    // 移除明显的自动化特征
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--ignore-certificate-errors'
    ]
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2, // 模拟视网膜屏幕
    hasTouch: false,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai'
  });

  // 注入脚本进一步隐藏自动化特征
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const page = await context.newPage();
  
  try {
    // 增加超时时间，避免网络波动导致的空白
    await page.goto(url, { 
      waitUntil: 'commit', // 只要建立连接就开始，不等待完整加载，减少被拦截几率
      timeout: 60000 
    });
  } catch (e) {
    console.error(`访问页面失败: ${e.message}`);
    console.log('请尝试在弹出的浏览器中手动输入网址。');
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question('登录完成后，请按 Enter 键继续...', async () => {
      try {
        const cookies = await context.cookies();
        fs.writeFileSync(cookiePath, JSON.stringify(cookies, null, 2));
        console.log(`\n✓ Cookie 已成功保存至: ${cookiePath}`);
      } catch (err) {
        console.error(`保存失败: ${err.message}`);
      } finally {
        rl.close();
        await browser.close();
        resolve();
      }
    });
  });
}

const site = process.argv[2];
const sites = {
  'boss': 'https://www.zhipin.com/',
  'liepin': 'https://www.liepin.com/',
  '51job': 'https://www.51job.com/',
};

if (!site || !sites[site]) {
  console.log('用法: node save-cookies.mjs [boss|liepin|51job]');
  process.exit(1);
}

saveCookies(site, sites[site]);
