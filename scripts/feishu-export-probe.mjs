import { chromium } from "playwright";

const url = "https://dcnb3gfq7cll.feishu.cn/wiki/C4X6wYOFqiYzcxk5gipcCem5nwe?sheet=0d46ae";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1600, height: 1000 },
  acceptDownloads: true,
});

await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForTimeout(25000);

console.log("title", await page.title());
console.log("url", page.url());

const selectors = [
  '[data-selector="more-menu"]',
  "#suite-share-btn",
  'button:has-text("菜单")',
  'button:has-text("更多")',
  "text=菜单",
  "text=下载",
  "text=导出",
  "text=另存为",
];

for (const selector of selectors) {
  const count = await page.locator(selector).count().catch((error) => `ERR ${error.message}`);
  console.log("selector", selector, count);
}

await page.screenshot({ path: "feishu-page.png", fullPage: false });
await browser.close();
