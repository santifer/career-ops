import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

/**
 * Basic YAML parser for portals.yml
 */
function parsePortals() {
  const portalsPath = path.join(projectRoot, 'portals.yml');
  if (!fs.existsSync(portalsPath)) return null;
  const content = fs.readFileSync(portalsPath, 'utf8');
  
  const config = {
    title_filter: { positive: [], negative: [] },
    tracked_companies: [],
    search_queries: []
  };

  // Extract positive keywords
  const posSection = content.match(/positive:([\s\S]+?)negative:/);
  if (posSection) {
    config.title_filter.positive = posSection[1].match(/- "([^"]+)"/g)?.map(m => m.match(/"([^"]+)"/)[1]) || [];
  }

  // Extract negative keywords
  const negSection = content.match(/negative:([\s\S]+?)seniority_boost:/);
  if (negSection) {
    config.title_filter.negative = negSection[1].match(/- "([^"]+)"/g)?.map(m => m.match(/"([^"]+)"/)[1]) || [];
  }

  return config;
}

/**
 * Filter JD title based on keywords
 */
export function filterTitle(title) {
  const config = parsePortals();
  const lowerTitle = title.toLowerCase();
  
  // 如果没有配置关键词，默认通过
  if (!config || !config.title_filter.positive.length) return true;

  const hasPositive = config.title_filter.positive.some(kw => lowerTitle.includes(kw.toLowerCase()));
  const hasNegative = config.title_filter.negative.some(kw => lowerTitle.includes(kw.toLowerCase()));
  
  if (hasPositive && !hasNegative) {
    console.log(`[Filter] ✅ Title: ${title}`);
  }
  return hasPositive && !hasNegative;
}

/**
 * Helper to launch stealth browser
 */
async function launchStealth(cookieName) {
  const browser = await chromium.launch({ 
    headless: false, // 强制显示浏览器，提高成功率
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-infobars'
    ]
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai'
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    window.chrome = { runtime: {}, loadTimes: function() {}, csi: function() {}, app: {} };
    Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en'] });
  });

  const cookiePath = path.join(projectRoot, 'data', 'cookies', `${cookieName}.json`);
  if (fs.existsSync(cookiePath)) {
    const cookies = JSON.parse(fs.readFileSync(cookiePath, 'utf8'));
    await context.addCookies(cookies);
  }

  return { browser, context };
}

/**
 * Normalize URL to PC Web version
 */
function normalizeUrl(url) {
  if (!url) return null;
  let normalized = url;
  
  // BOSS Zhipin: m.zhipin.com -> www.zhipin.com
  if (normalized.includes('m.zhipin.com')) {
    normalized = normalized.replace('m.zhipin.com', 'www.zhipin.com');
  }
  
  // Remove query parameters to clean up the URL
  if (normalized.includes('?')) {
    normalized = normalized.split('?')[0];
  }
  
  return normalized;
}

/**
 * Discover new JDs from BOSS Zhipin (Stealth Search)
 */
export async function scanBoss(keyword = '产品总监', city = '101020100') {
  const url = `https://www.zhipin.com/web/geek/job?query=${encodeURIComponent(keyword)}&city=${city}`;
  const { browser, context } = await launchStealth('boss');
  const page = await context.newPage();
  const results = [];

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3000); // 额外等待渲染
    
    const jobs = await page.evaluate(() => {
      const items = document.querySelectorAll('.job-card-wrapper');
      return Array.from(items).map(item => {
        const title = item.querySelector('.job-name')?.innerText;
        const company = item.querySelector('.company-name')?.innerText;
        const link = item.querySelector('.job-card-left')?.getAttribute('href');
        // We will normalize this later in the node context
        return { title, company, url: link };
      });
    });

    console.log(`[BOSS] Raw items found for "${keyword}": ${jobs.length}`);
    for (const job of jobs) {
      if (job.title && filterTitle(job.title) && job.url) {
        const fullUrl = job.url.startsWith('http') ? job.url : `https://www.zhipin.com${job.url}`;
        results.push({ ...job, url: normalizeUrl(fullUrl) });
      }
    }
  } catch (error) {
    console.error('BOSS 搜索失败:', error.message);
  } finally {
    await browser.close();
  }
  return results;
}

/**
 * Discover new JDs from Liepin
 */
export async function scanLiepin(keyword = '产品总监') {
  const keywords = [keyword, 'AI产品经理', '产品负责人'];
  let results = [];

  for (const kw of keywords) {
    const url = `https://www.liepin.com/zhaopin/?city=020&dq=020&pubTime=&currentPage=0&pageSize=40&key=${encodeURIComponent(kw)}`;
    const { browser, context } = await launchStealth('liepin');
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(3000);
      
      const jobs = await page.evaluate(() => {
        const items = document.querySelectorAll('.job-card-pc-container, .job-list-item, [class*="job-card"], [class*="job-list-item"]');
        return Array.from(items).map(item => {
          const titleEl = item.querySelector('[class*="job-name"], [class*="title"], .job-name, .name');
          const companyEl = item.querySelector('[class*="company-name"], .company-name, .company');
          const linkEl = item.querySelector('a');
          return { title: titleEl?.innerText?.trim(), company: companyEl?.innerText?.trim(), url: linkEl?.getAttribute('href') };
        });
      });

      console.log(`[Liepin] Raw items found for "${kw}": ${jobs.length}`);
      for (const job of jobs) {
        if (job.title && filterTitle(job.title)) {
          const fullUrl = job.url ? (job.url.startsWith('http') ? job.url : `https://www.liepin.com${job.url}`) : null;
          if (fullUrl) results.push({ ...job, url: normalizeUrl(fullUrl) });
        }
      }
    } catch (error) {
      console.error(`猎聘搜索 [${kw}] 失败:`, error.message);
    } finally {
      await browser.close();
    }
  }
  return results;
}

/**
 * Discover new JDs from 51job
 */
export async function scan51Job(keyword = '产品总监') {
  const keywords = [keyword, 'AI产品', '高级产品经理'];
  let results = [];

  for (const kw of keywords) {
    const url = `https://we.51job.com/pc/search?keyword=${encodeURIComponent(kw)}&location=020000`;
    const { browser, context } = await launchStealth('51job');
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(3000);
      
      const jobs = await page.evaluate(() => {
        const items = document.querySelectorAll('.joblist-item, [class*="job-item"], [class*="job_item"]');
        return Array.from(items).map(item => {
          const titleEl = item.querySelector('.jname, .job-name, [class*="job-name"], .name');
          const companyEl = item.querySelector('.cname, .company-name, [class*="company-name"], .company');
          const linkEl = item.querySelector('a');
          return { title: titleEl?.innerText?.trim(), company: companyEl?.innerText?.trim(), url: linkEl?.getAttribute('href') };
        });
      });

      console.log(`[51job] Raw items found for "${kw}": ${jobs.length}`);
      for (const job of jobs) {
        if (job.title && filterTitle(job.title) && job.url) {
          results.push({ ...job, url: normalizeUrl(job.url) });
        }
      }
    } catch (error) {
      console.error(`51job 搜索 [${kw}] 失败:`, error.message);
    } finally {
      await browser.close();
    }
  }
  return results;
}

/**
 * Update pipeline.md with new findings
 */
export function addToPipeline(jobs) {
  const pipelinePath = path.join(projectRoot, 'data', 'pipeline.md');
  let content = fs.existsSync(pipelinePath) ? fs.readFileSync(pipelinePath, 'utf8') : '# Job Pipeline\n\n## ⏳ 待处理 (Pending)\n';
  
  let addedCount = 0;
  for (const job of jobs) {
    const entry = `- [ ] ${job.url} | ${job.company} | ${job.title}`;
    if (!content.includes(job.url)) {
      content = content.replace('## ⏳ 待处理 (Pending)', `## ⏳ 待处理 (Pending)\n${entry}`);
      addedCount++;
    }
  }

  fs.writeFileSync(pipelinePath, content, 'utf8');
  return addedCount;
}
