import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/SOC-AI-Application-Engineer---AI-Services--Agents-and-Knowledge-Systems_JR2016498');
  await page.waitForSelector('[data-automation-id="jobPostingDescription"]');
  const description = await page.innerText('[data-automation-id="jobPostingDescription"]');
  console.log(description);
  await browser.close();
})();
