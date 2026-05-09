import asyncio
from playwright.async_api import async_playwright
from bs4 import BeautifulSoup


async def extract_job(url):

    async with async_playwright() as p:

        browser = await p.chromium.launch(
            headless=False
        )

        page = await browser.new_page()

        print("\nOpening page...")

        await page.goto(
            url,
            wait_until="networkidle",
            timeout=120000
        )

        # Extra wait for dynamic content
        await page.wait_for_timeout(5000)

        html = await page.content()

        with open(
            "job_page.html",
            "w",
            encoding="utf-8"
        ) as f:
            f.write(html)

        soup = BeautifulSoup(html, "lxml")

        # Remove unnecessary tags
        for tag in soup([
            "script",
            "style",
            "noscript"
        ]):
            tag.extract()

        text = soup.get_text(separator=" ")

        cleaned = " ".join(text.split())

        with open(
            "job_description.txt",
            "w",
            encoding="utf-8"
        ) as f:
            f.write(cleaned)

        print("\nJob description extracted.")

        print("\nPreview:\n")
        print(cleaned[:1500])

        await browser.close()


url = input("Enter Job URL: ")

asyncio.run(extract_job(url))