import asyncio
import json
import os

from playwright.async_api import async_playwright


# =========================
# LOAD APPLICANT INFO
# =========================

with open(
    "applicant.json",
    "r",
    encoding="utf-8"
) as f:

    applicant = json.load(f)


# =========================
# JOB URL
# =========================

job_url = input("Enter Job URL: ").strip()

resume_path = os.path.abspath(
    "resumes/generated/selected_resume.pdf"
)


# =========================
# MAIN AUTOMATION
# =========================

async def apply():

    async with async_playwright() as p:

        browser = await p.chromium.launch(
            headless=False
        )

        page = await browser.new_page()

        print("\nOpening job page...")

        await page.goto(
            job_url,
            wait_until="domcontentloaded",
            timeout=120000
        )

        await page.wait_for_timeout(5000)

        print("\nSearching for Apply button...")

        apply_selectors = [
            "text=Apply",
            "text='Apply Now'",
            "button:has-text('Apply')",
            "a:has-text('Apply')"
        ]

        clicked = False

        for selector in apply_selectors:

            try:

                await page.locator(selector).first.click(
                    timeout=3000
                )

                print(
                    f"Clicked apply using: {selector}"
                )

                clicked = True

                break

            except Exception:
                continue

        if not clicked:

            print(
                "\nCould not find Apply button."
            )

            await browser.close()

            return

        await page.wait_for_timeout(5000)

        # =========================
        # FILL INPUT FIELDS
        # =========================

        print("\nFilling applicant fields...")

        field_map = {
            "name": applicant["name"],
            "full name": applicant["name"],
            "email": applicant["email"],
            "phone": applicant["phone"],
            "linkedin": applicant["linkedin"],
            "github": applicant["github"],
            "portfolio": applicant["portfolio"]
        }

        inputs = await page.locator("input").all()

        for input_box in inputs:

            try:

                name_attr = (
                    await input_box.get_attribute("name")
                    or ""
                ).lower()

                placeholder = (
                    await input_box.get_attribute(
                        "placeholder"
                    )
                    or ""
                ).lower()

                combined = (
                    name_attr + " " + placeholder
                )

                for key, value in field_map.items():

                    if key in combined:

                        await input_box.fill(value)

                        print(f"Filled: {key}")

                        break

            except Exception:
                continue

        # =========================
        # RESUME UPLOAD
        # =========================

        print("\nUploading resume...")

        file_inputs = await page.locator(
            "input[type='file']"
        ).all()

        uploaded = False

        for file_input in file_inputs:

            try:

                await file_input.set_input_files(
                    resume_path
                )

                print("Resume uploaded.")

                uploaded = True

                break

            except Exception:
                continue

        if not uploaded:

            print(
                "Could not upload resume automatically."
            )

        print("\nAutomation completed.")
        print(
            "Review everything manually before submitting."
        )

        await page.wait_for_timeout(30000)

        await browser.close()


asyncio.run(apply())