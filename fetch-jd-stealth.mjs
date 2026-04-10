import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

/**
 * 模拟人类行为的高级抓取脚本
 * 针对 BOSS 直聘等严格反爬平台进行了优化
 */
async function fetchJDStealth(url, siteName) {
  const cookiePath = path.join(process.cwd(), 'data', 'cookies', `${siteName}.json`);
  
  const browser = await chromium.launch({ 
    headless: true, // 生产环境建议 headless: true
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--ignore-certificate-errors',
      '--window-size=1920,1080'
    ]
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai'
  });

  // 1. 注入隐身脚本：移除 webdriver 标记，模拟真实插件环境
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    // 模拟 Chrome 插件环境
    window.chrome = { runtime: {} };
    // 模拟语言偏好
    Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en'] });
  });

  // 2. 注入 Cookie
  if (fs.existsSync(cookiePath)) {
    const cookies = JSON.parse(fs.readFileSync(cookiePath, 'utf-8'));
    // 过滤掉不合法的 cookie 属性
    const validCookies = cookies.map(c => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      secure: c.secure,
      httpOnly: c.httpOnly,
      sameSite: c.sameSite === 'None' ? 'None' : (c.sameSite === 'Lax' ? 'Lax' : 'Strict')
    }));
    await context.addCookies(validCookies);
    console.error(`[${siteName}] 已从本地加载 Cookie 进行鉴权`);
  }

  const page = await context.newPage();
  
  try {
    console.error(`正在启动隐身抓取: ${url}`);
    
    // 3. 随机延迟，模拟人类操作习惯
    await page.waitForTimeout(Math.floor(Math.random() * 2000) + 1000);

    // 4. 访问页面
    const response = await page.goto(url, { 
      waitUntil: 'domcontentloaded', 
      timeout: 60000 
    });

    if (response.status() === 403) {
      throw new Error('被拦截 (403 Forbidden) - 建议更新 Cookie 或更换 IP');
    }

    // 5. 模拟滚动，触发懒加载和反爬验证
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        let distance = 100;
        let timer = setInterval(() => {
          let scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;
          if(totalHeight >= scrollHeight){
            clearInterval(timer);
            resolve();
          }
        }, 100);
      });
    });

    // 6. 针对不同平台的选择器优化
    let content = "";
    if (siteName === 'boss') {
      await page.waitForSelector('.job-detail', { timeout: 15000 }).catch(() => {});
      content = await page.evaluate(() => {
        const title = document.querySelector('.name')?.innerText || "";
        const salary = document.querySelector('.salary')?.innerText || "";
        const desc = document.querySelector('.job-sec-text')?.innerText || "";
        const company = document.querySelector('.company-info .name')?.innerText || "";
        return `职位: ${title}\n薪资: ${salary}\n公司: ${company}\n\n详情:\n${desc}`;
      });
    } else if (siteName === 'liepin') {
      await page.waitForSelector('.job-description-main', { timeout: 15000 }).catch(() => {});
      content = await page.evaluate(() => {
        const title = document.querySelector('.name')?.innerText || "";
        const salary = document.querySelector('.salary')?.innerText || "";
        const desc = document.querySelector('.job-description-main')?.innerText || "";
        return `职位: ${title}\n薪资: ${salary}\n\n详情:\n${desc}`;
      });
    } else {
      content = await page.evaluate(() => document.body.innerText);
    }

    if (!content || content.trim().length < 50) {
      throw new Error('抓取内容过短，可能触发了验证码或页面加载失败');
    }

    const title = await page.title();
    // 输出 JSON 结果到 stdout
    process.stdout.write(JSON.stringify({ title, content }));
    console.error(`✓ 抓取成功: ${title}`);

  } catch (e) {
    console.error(`❌ 抓取失败: ${e.message}`);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

const url = process.argv[2];
const site = process.argv[3];

if (!url || !site) {
  console.error('用法: node fetch-jd-stealth.mjs [url] [boss|liepin|51job]');
  process.exit(1);
}

fetchJDStealth(url, site);
