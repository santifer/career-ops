import asyncio
import json

from playwright.async_api import async_playwright


with open(
    "applicant.json",
    "r",
    encoding="utf-8"
) as f:

    applicant = json.load(f)


job_url = input(
    "Enter Wellfound Job URL: "
).strip()


async def apply():

    async with async_playwright() as p:

        browser = await p.chromium.launch(
            headless=False
        )

        context = await browser.new_context()

        page = await context.new_page()

        print("\nOpening Wellfound page...")

        await page.goto(
            job_url,
            wait_until="networkidle",
            timeout=120000
        )

        await page.wait_for_timeout(5000)

        print(
            "\nPlease login manually if required."
        )

        await page.wait_for_timeout(15000)

        apply_buttons = [
            "text=Apply",
            "text=Easy Apply",
            "button:has-text('Apply')"
        ]

        clicked = False

        for selector in apply_buttons:

            try:

                await page.locator(selector).first.click()

                clicked = True

                print(
                    f"Clicked: {selector}"
                )

                break

            except:
                continue

        if not clicked:

            print(
                "\nCould not find Apply button."
            )

            await browser.close()

            return

        print(
            "\nManual completion may still be required."
        )

        await page.wait_for_timeout(30000)

        await browser.close()


asyncio.run(apply())