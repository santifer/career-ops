import asyncio
import json
import os

from dotenv import load_dotenv
from openai import OpenAI
from playwright.async_api import async_playwright
from rapidfuzz import fuzz


# =========================
# LOAD ENV
# =========================

load_dotenv()

client = OpenAI(
    api_key=os.getenv("GROQ_API_KEY"),
    base_url="https://api.groq.com/openai/v1"
)


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
# LOAD PROFILE + JD
# =========================

with open(
    "candidate_profile.txt",
    "r",
    encoding="utf-8"
) as f:

    candidate_profile = f.read()


job_url = input(
    "Enter LinkedIn Job URL: "
).strip()

resume_path = os.path.abspath(
    "resumes/generated/tailored_resume.pdf"
)


# =========================
# AI ANSWERS
# =========================

def generate_answer(question):

    prompt = f"""
You are an expert job application assistant.

Generate a concise professional answer.

Candidate Profile:
{candidate_profile}

Question:
{question}
"""

    response = client.chat.completions.create(

        model="llama-3.3-70b-versatile",

        messages=[
            {
                "role": "user",
                "content": prompt
            }
        ],

        temperature=0.4,
        max_tokens=200
    )

    return (
        response
        .choices[0]
        .message
        .content
        .strip()
    )


# =========================
# FUZZY MATCHING
# =========================

def fuzzy_match_field(
    combined,
    field_values
):

    best_match = None
    best_score = 0

    for field in field_values:

        score = fuzz.partial_ratio(
            combined,
            field
        )

        if score > best_score:

            best_score = score
            best_match = field

    return best_match, best_score


# =========================
# MAIN AUTOMATION
# =========================

async def apply():

    async with async_playwright() as p:

        context = await p.chromium.launch_persistent_context(

            user_data_dir="linkedin_browser_data",

            headless=False
        )

        page = await context.new_page()

        print("\nOpening LinkedIn job page...")

        await page.goto(
            job_url,
            wait_until="networkidle",
            timeout=120000
        )

        await page.wait_for_timeout(5000)

        # =========================
        # LOGIN CHECK
        # =========================

        if "login" in page.url:

            print(
                "\nPlease login manually."
            )

            input(
                "\nPress ENTER after login..."
            )

        # =========================
        # EASY APPLY CLICK
        # =========================

        print(
            "\nSearching for Easy Apply..."
        )

        easy_apply_buttons = [

            "button:has-text('Easy Apply')",

            "text=Easy Apply"
        ]

        clicked = False

        for selector in easy_apply_buttons:

            try:

                await page.locator(
                    selector
                ).first.click(
                    timeout=5000
                )

                clicked = True

                print(
                    "Easy Apply clicked."
                )

                break

            except Exception:
                continue

        if not clicked:

            print(
                "\nEasy Apply not found."
            )

            return

        await page.wait_for_timeout(5000)

        # =========================
        # FIELD VALUES
        # =========================

        field_values = {

            "name":
                applicant["name"],

            "email":
                applicant["email"],

            "phone":
                applicant["phone"],

            "mobile":
                applicant["phone"],

            "linkedin":
                applicant["linkedin"],

            "website":
                applicant["portfolio"],

            "portfolio":
                applicant["portfolio"],

            "city":
                applicant["location"],

            "location":
                applicant["location"]
        }

        # =========================
        # INPUT HANDLING
        # =========================

        print(
            "\nHandling inputs..."
        )

        inputs = await page.locator(
            "input"
        ).all()

        for input_box in inputs:

            try:

                input_type = (
                    await input_box.get_attribute(
                        "type"
                    )
                    or ""
                ).lower()

                if input_type in [
                    "hidden",
                    "submit",
                    "radio",
                    "checkbox",
                    "file"
                ]:
                    continue

                name_attr = (
                    await input_box.get_attribute(
                        "name"
                    )
                    or ""
                ).lower()

                placeholder = (
                    await input_box.get_attribute(
                        "placeholder"
                    )
                    or ""
                ).lower()

                aria_label = (
                    await input_box.get_attribute(
                        "aria-label"
                    )
                    or ""
                ).lower()

                combined = (
                    name_attr
                    + " "
                    + placeholder
                    + " "
                    + aria_label
                )

                print(
                    f"FIELD -> {combined}"
                )

                best_match, score = fuzzy_match_field(
                    combined,
                    field_values
                )

                print(
                    f"BEST MATCH -> {best_match} ({score})"
                )

                if score >= 70:

                    value = field_values[
                        best_match
                    ]

                    await input_box.fill("")

                    await input_box.fill(value)

                    print(
                        f"Filled -> {value}"
                    )

            except Exception as e:

                print(
                    f"Input error: {e}"
                )

        # =========================
        # RESUME UPLOAD
        # =========================

        print(
            "\nUploading resume..."
        )

        file_inputs = await page.locator(
            "input[type='file']"
        ).all()

        for file_input in file_inputs:

            try:

                await file_input.set_input_files(
                    resume_path
                )

                print(
                    "Resume uploaded."
                )

                break

            except Exception as e:

                print(
                    f"Upload error: {e}"
                )

        # =========================
        # TEXTAREA ANSWERS
        # =========================

        print(
            "\nHandling questions..."
        )

        textareas = await page.locator(
            "textarea"
        ).all()

        for textarea in textareas:

            try:

                question = (
                    await textarea.get_attribute(
                        "aria-label"
                    )
                    or ""
                )

                if not question:

                    question = (
                        await textarea.get_attribute(
                            "placeholder"
                        )
                        or ""
                    )

                if not question:
                    continue

                print(
                    f"\nQUESTION -> {question}"
                )

                answer = generate_answer(question)

                await textarea.fill(answer)

                print(
                    "Answer inserted."
                )

            except Exception as e:

                print(
                    f"Textarea error: {e}"
                )

        # =========================
        # CHECKBOXES
        # =========================

        checkboxes = await page.locator(
            "input[type='checkbox']"
        ).all()

        for checkbox in checkboxes:

            try:

                await checkbox.check()

            except Exception:
                pass

        # =========================
        # MANUAL REVIEW
        # =========================

        print(
            "\nAutomation completed."
        )

        print(
            "Review manually before submitting."
        )

        input(
            "\nPress ENTER after submission..."
        )


asyncio.run(apply())