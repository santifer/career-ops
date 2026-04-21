import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { sendWeComMessage } from './wecom-notify.mjs';
import { syncToObsidian, syncResumeMarkdownToObsidian } from './obsidian-sync.mjs';
import { evaluateJD } from './evaluate-jd.mjs';
import { scanBoss, scanLiepin, scan51Job, addToPipeline } from './portal-scanner.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

const EXPIRED_PATTERNS = [
  /该职位已关闭/i, /职位已失效/i, /停止招聘/i, /该职位已下架/i, /职位已关闭/i,
  /job (is )?no longer available/i, /position has been filled/i
];

/**
 * Main Daily Sync Task
 */
async function runDailySync() {
  console.log('--- 启动 Career-Ops-CN 每日自动化任务 ---');
  console.log(`时间: ${new Date().toLocaleString()}`);

  // 1. 获取配置
  const profilePath = path.join(projectRoot, 'config', 'profile.yml');
  const profileContent = fs.readFileSync(profilePath, 'utf8');
  const scanLimitMatch = profileContent.match(/daily_scan_limit:\s*(\d+)/);
  const scanLimit = scanLimitMatch ? parseInt(scanLimitMatch[1]) : 10;

  // 2. 发现新职位
  console.log('正在执行多平台搜索发现新职位...');
  const searchKeyword = '产品总监';
  
  const liepinJobs = await scanLiepin(searchKeyword);
  const job51Jobs = await scan51Job(searchKeyword);
  const bossJobs = await scanBoss(searchKeyword);

  const allJobs = [...liepinJobs, ...job51Jobs, ...bossJobs];
  const addedCount = addToPipeline(allJobs);
  console.log(`已发现并添加 ${addedCount} 个新职位至 pipeline.md`);

  // 3. 处理前 N 个职位
  const pipelinePath = path.join(projectRoot, 'data', 'pipeline.md');
  if (!fs.existsSync(pipelinePath)) return;

  let pipelineContent = fs.readFileSync(pipelinePath, 'utf8');
  const pendingMatches = [...pipelineContent.matchAll(/- \[ \] (https?:\/\/[^\s|]+)\s*\|\s*([^|]+)\s*\|\s*(.+)/g)];
  
  if (pendingMatches.length === 0) {
    console.log('没有待评估的职位。');
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const toProcess = pendingMatches.slice(0, scanLimit);
  let summary = `# 🤖 Career-Ops-CN 每日精选报告\n> 发现日期: ${new Date().toLocaleDateString()}\n\n---\n\n`;

  for (const match of toProcess) {
    const [full, url, company, title] = match;
    console.log(`正在处理: ${title} @ ${company}...`);

    try {
      // A. 抓取 JD 内容并检查存活
      const { jdText, salary, isExpired, reason } = await fetchJDTextAndSalary(browser, url);
      
      if (isExpired) {
        console.log(`[Skip] 职位已下架: ${title} (${reason})`);
        const discardedLine = `- [x] ${url} | ${company} | ${title} | 状态: 已下架 (${reason})`;
        pipelineContent = pipelineContent.replace(full, discardedLine);
        fs.writeFileSync(pipelinePath, pipelineContent, 'utf8');
        continue;
      }

      // B. 自动化评估
      const { score, report, brief } = await evaluateJD(jdText, company, title);
      
      // C. 同步简历 (不再生成 PDF)
      const resumeFileName = `${company}-${title.replace(/\//g, '-')}-Resume.md`;
      const cvMd = fs.readFileSync(path.join(projectRoot, 'cv.md'), 'utf8');
      const obsidianResumeLink = await syncResumeMarkdownToObsidian(cvMd, resumeFileName);

      // D. 同步报告
      const reportFileName = `${new Date().toISOString().split('T')[0]}-${company}-${title.replace(/\//g, '-')}`;
      const metadata = {
        title, company, score, salary, url,
        date: new Date().toISOString().split('T')[0],
        resume_md: obsidianResumeLink,
        application_status: "未投递"
      };
      await syncToObsidian(report, reportFileName, metadata);

      // E. 构建通知
      const scoreEmoji = parseFloat(score) >= 4.5 ? '🔥' : (parseFloat(score) >= 4.0 ? '⭐' : '📝');
      summary += `### ${scoreEmoji} ${title} @ ${company}\n`;
      summary += `- **💰 薪资**: \`${salary || '面议'}\`\n`;
      summary += `- **🎯 评分**: **${score}** / 5.0\n`;
      summary += `- **📋 亮点**:\n${brief}\n`;
      summary += `- **🔗 [查看职位详情](${url})**\n\n---\n\n`;

      // F. 更新 pipeline.md
      const updatedLine = `- [x] ${url} | ${company} | ${title} | Score: ${score}`;
      pipelineContent = pipelineContent.replace(full, updatedLine);
      fs.writeFileSync(pipelinePath, pipelineContent, 'utf8');

    } catch (error) {
      console.error(`处理 ${title} 失败:`, error.message);
    }
  }

  await browser.close();
  await sendWeComMessage(summary);
  
  // 5. 自动导出 Gemini Wiki 笔记
  try {
    console.log('正在执行 Wiki 备份...');
    const { execSync } = await import('child_process');
    execSync(`node ${path.join(projectRoot, 'scripts', 'export-wiki.mjs')}`, { stdio: 'inherit' });
  } catch (e) {
    console.error('Wiki 备份失败:', e.message);
  }

  console.log('--- 每日自动化任务已完成 ---');
}

/**
 * 内部抓取函数 (带鉴权和存活检查)
 */
async function fetchJDTextAndSalary(browser, url) {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  });
  
  // 加载对应平台的 Cookie
  let siteName = url.includes('zhipin.com') ? 'boss' : (url.includes('liepin.com') ? 'liepin' : (url.includes('51job.com') ? '51job' : ''));
  if (siteName) {
    const cookiePath = path.join(projectRoot, 'data', 'cookies', `${siteName}.json`);
    if (fs.existsSync(cookiePath)) {
      const cookies = JSON.parse(fs.readFileSync(cookiePath, 'utf8'));
      await context.addCookies(cookies.map(c => ({
        name: c.name, value: c.value, domain: c.domain, path: c.path,
        secure: c.secure, httpOnly: c.httpOnly,
        sameSite: c.sameSite === 'None' ? 'None' : (c.sameSite === 'Lax' ? 'Lax' : 'Strict')
      })));
    }
  }

  const page = await context.newPage();
  let result = { jdText: "", salary: "面议", isExpired: false, reason: "" };

  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    const finalUrl = page.url();
    if (url.includes('job_detail') && finalUrl.includes('/web/geek/job')) {
       result.isExpired = true;
       result.reason = "重定向至搜索页";
       return result;
    }

    const bodyText = await page.evaluate(() => document.body.innerText);
    
    // 存活检查
    for (const pattern of EXPIRED_PATTERNS) {
      if (pattern.test(bodyText)) {
        result.isExpired = true;
        result.reason = "页面显示已关闭/下架";
        return result;
      }
    }

    // 薪资提取
    result.salary = await page.evaluate(() => {
      const selectors = ['.salary', '.job-salary', '.money', '[class*="salary"]'];
      for (const s of selectors) {
        const el = document.querySelector(s);
        if (el && el.innerText.trim()) return el.innerText.trim();
      }
      return "面议";
    });

    result.jdText = bodyText.slice(0, 2500);
  } catch (e) {
    result.isExpired = true;
    result.reason = `抓取异常: ${e.message}`;
  } finally {
    await context.close();
  }
  return result;
}

runDailySync().catch(console.error);
