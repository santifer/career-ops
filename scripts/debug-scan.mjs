import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

async function debugScan() {
  console.log('--- 启动 51job & 猎聘 深度调试扫描 ---');

  const browser = await chromium.launch({ headless: false }); // 开启界面观察
  const context = await browser.newContext();

  // 1. 调试 51job
  console.log('\n[DEBUG] 正在测试 51job...');
  const job51CookiePath = path.join(projectRoot, 'data', 'cookies', '51job.json');
  if (fs.existsSync(job51CookiePath)) {
    console.log('加载 51job Cookie...');
    await context.addCookies(JSON.parse(fs.readFileSync(job51CookiePath, 'utf8')));
  }

  const page = await context.newPage();
  try {
    const url51 = `https://we.51job.com/pc/search?keyword=${encodeURIComponent('产品总监')}&location=020000`;
    await page.goto(url51, { waitUntil: 'networkidle', timeout: 30000 });
    
    // 等待 10 秒观察页面内容
    console.log('等待 51job 页面渲染...');
    await page.waitForTimeout(5000);

    const content = await page.content();
    fs.writeFileSync(path.join(projectRoot, 'debug-51job.html'), content);
    console.log('已保存 51job 页面快照至 debug-51job.html');

    const jobCount = await page.evaluate(() => {
      const items = document.querySelectorAll('.joblist-item, [class*="job-item"]');
      return items.length;
    });
    console.log(`发现 51job 职位元素数量: ${jobCount}`);
  } catch (e) {
    console.error('51job 调试失败:', e.message);
  }

  // 2. 调试 猎聘
  console.log('\n[DEBUG] 正在测试 猎聘...');
  const liepinCookiePath = path.join(projectRoot, 'data', 'cookies', 'liepin.json');
  if (fs.existsSync(liepinCookiePath)) {
    console.log('加载 猎聘 Cookie...');
    await context.addCookies(JSON.parse(fs.readFileSync(liepinCookiePath, 'utf8')));
  }

  try {
    const urlLiepin = `https://www.liepin.com/zhaopin/?key=${encodeURIComponent('产品总监')}&city=020`;
    await page.goto(urlLiepin, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(5000);

    const content = await page.content();
    fs.writeFileSync(path.join(projectRoot, 'debug-liepin.html'), content);
    console.log('已保存 猎聘 页面快照至 debug-liepin.html');

    const jobCount = await page.evaluate(() => {
      const items = document.querySelectorAll('.job-card-pc-container, .job-list-item');
      return items.length;
    });
    console.log(`发现 猎聘 职位元素数量: ${jobCount}`);
  } catch (e) {
    console.error('猎聘 调试失败:', e.message);
  }

  await browser.close();
  console.log('\n--- 调试结束 ---');
}

debugScan();
