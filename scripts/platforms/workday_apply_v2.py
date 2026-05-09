import asyncio
import json
import os
import re
from collections import defaultdict

from dotenv import load_dotenv
from openai import OpenAI
from playwright.async_api import async_playwright
from rapidfuzz import fuzz


# Workday apply automation v2 - per-company memory + user approval

load_dotenv()

api_key = os.getenv("GROQ_API_KEY") or os.getenv("OPENAI_API_KEY") or os.getenv("OPENAI_API_KEY_ALT")
if not api_key:
    print("Warning: no API key found. AI features will be disabled.")
    client = None
else:
    client = OpenAI(
        api_key=api_key,
        base_url="https://api.groq.com/openai/v1"
    )

with open("applicant.json", "r", encoding="utf-8") as f:
    applicant = json.load(f)

with open("candidate_profile.txt", "r", encoding="utf-8") as f:
    candidate_profile = f.read()

with open("job_description.txt", "r", encoding="utf-8") as f:
    job_description = f.read()

job_url = input("Enter Workday Job URL: ").strip()


def extract_company_name(url):
    # Workday URLs: https://company.wd1.myworkdayjobs.com/...
    match = re.search(r'https?://([^.]+)\.wd\d+\.myworkdayjobs\.com', url)
    if match:
        return match.group(1).replace('-', '_')
    company_name = input("Could not detect company from URL. Enter company name: ").strip()
    return company_name.replace(' ', '_').replace('-', '_').lower()


def get_memory_path(company_name):
    os.makedirs("field_memory", exist_ok=True)
    return os.path.join("field_memory", f"{company_name}_memory.json")


def load_company_memory(company_name):
    path = get_memory_path(company_name)
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_company_memory(company_name, memory):
    path = get_memory_path(company_name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(memory, f, indent=2, ensure_ascii=False)


company_name = extract_company_name(job_url)
print(f"\nCompany: {company_name}")

field_memory = load_company_memory(company_name)
print(f"Loaded {len(field_memory)} saved fields for {company_name}")

resume_path = os.path.abspath("resumes/generated/tailored_resume.pdf")
print(f"Using resume: {resume_path}\n")

browser_profile = os.path.abspath("browser_data")
os.makedirs(browser_profile, exist_ok=True)


def safe_get(key, default=""):
    value = applicant.get(key, default)
    return "" if value is None else str(value).strip()


def normalize_space(text):
    return re.sub(r"\s+", " ", (text or "")).strip()


def normalize_key(text):
    return normalize_space((text or "").lower())


def parse_json_block(text):
    cleaned = (text or "").strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        return json.loads(cleaned)
    except Exception:
        match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(0))
            except Exception:
                return None
    return None


def fuzzy_match_field(combined, field_values):
    combined = normalize_key(combined)
    exact_checks = [
        (["first name", "given name"], "first name"),
        (["last name", "surname"], "last name"),
        (["full name", "legal name"], "full name"),
        (["email"], "email"),
        (["phone", "mobile"], "phone"),
    ]
    for patterns, key in exact_checks:
        if any(p in combined for p in patterns) and key in field_values:
            return key, 100
    best_match = None
    best_score = 0
    for field in field_values:
        score = fuzz.token_sort_ratio(combined, field)
        if score > best_score:
            best_score = score
            best_match = field
    return best_match, best_score


def generate_structured_answer(question, answer_kind="short_text", options=None):
    options = options or []
    options_text = "\n".join(f"- {item}" for item in options)
    prompt = f"""
You are an expert job application assistant. Output ONLY valid JSON: {{"answer":"string","confidence":0.0}}
Candidate profile:
{candidate_profile}
Applicant JSON:
{json.dumps(applicant, ensure_ascii=False, indent=2)}
Job description:
{job_description}
Question: {question}
Options: {options_text or 'N/A'}
answer_kind: {answer_kind}
"""

    if client is None:
        return "", 0.0

    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=260,
        )
        raw = response.choices[0].message.content.strip()
    except Exception as e:
        print(f"AI error: {e}")
        return "", 0.0

    data = parse_json_block(raw)
    if isinstance(data, dict) and "answer" in data:
        return normalize_space(str(data.get("answer", ""))), float(data.get("confidence", 0.5) or 0.5)
    return normalize_space(raw), 0.4


def ask_user_for_field(field_label, ai_answer, confidence):
    """Show AI answer and ask user for approval/override"""
    if not ai_answer:
        print(f"\n[{field_label}]")
        print("No AI answer generated.")
        user_input = input("Enter answer manually (or press Enter to skip): ").strip()
        return user_input if user_input else None

    print(f"\n[{field_label}]")
    print(f"AI Answer ({confidence:.0%} confidence):")
    print(f"  {ai_answer}")
    user_choice = input("Accept this? (y/edit/n): ").strip().lower()

    if user_choice == "y":
        return ai_answer
    elif user_choice == "edit":
        edited = input("New answer: ").strip()
        return edited if edited else ai_answer
    else:
        return None


def pick_best_option(target_value, options):
    target = normalize_key(target_value)
    cleaned_options = [normalize_space(o) for o in options if normalize_space(o)]
    if not cleaned_options:
        return None
    for option in cleaned_options:
        if target and (target in normalize_key(option) or normalize_key(option) in target):
            return option
    best = None
    best_score = 0
    for option in cleaned_options:
        score = fuzz.token_sort_ratio(target, normalize_key(option))
        if score > best_score:
            best_score = score
            best = option
    return best if best_score >= 60 else None


async def extract_field_context_generic(el):
    name = (await el.get_attribute("name") or "").strip()
    placeholder = (await el.get_attribute("placeholder") or "").strip()
    aria = (await el.get_attribute("aria-label") or "").strip()
    field_id = (await el.get_attribute("id") or "").strip()
    label = ""
    if field_id:
        try:
            label = normalize_space(await el.page.locator(f"label[for='{field_id}']").first.inner_text(timeout=800))
        except Exception:
            label = ""
    combined = normalize_space(" ".join([label, name, placeholder, aria]))
    return {"name": name, "placeholder": placeholder, "aria": aria, "label": label, "combined": combined}


def build_field_values():
    full_name = safe_get("name")
    parts = full_name.split()
    return {
        "first name": parts[0] if parts else "",
        "last name": " ".join(parts[1:]) if len(parts) > 1 else "",
        "full name": full_name,
        "email": safe_get("email"),
        "phone": safe_get("phone"),
        "linkedin": safe_get("linkedin"),
        "portfolio": safe_get("portfolio"),
    }


async def apply():
    generated_cache = {}
    async with async_playwright() as p:
        browser = await p.chromium.launch_persistent_context(user_data_dir=browser_profile, headless=False)
        page = await browser.new_page()
        print("\nOpening Workday page...")
        await page.goto(job_url, wait_until="networkidle", timeout=120000)
        await page.wait_for_timeout(4000)

        # Detect login
        login_detected = False
        try:
            if await page.locator("input[type='password']").count() > 0:
                login_detected = True
            elif await page.locator("text=Sign in").count() > 0:
                login_detected = True
        except Exception:
            pass

        if login_detected:
            print("\nLogin required. Please complete login in the browser window.")
            input("After login, press ENTER here to continue...")
            await page.wait_for_timeout(1500)

        # Click apply
        apply_selectors = ["text=Apply", "text=Apply Now", "button:has-text('Apply')", "a:has-text('Apply')"]
        clicked = False
        for sel in apply_selectors:
            try:
                await page.locator(sel).first.click(timeout=4000)
                clicked = True
                print(f"Clicked apply button")
                break
            except Exception:
                continue

        await page.wait_for_timeout(2500)
        root = page

        # Try resume upload
        try:
            file_inputs = await root.locator("input[type='file']").all()
            for fi in file_inputs:
                try:
                    await fi.set_input_files(resume_path)
                    print("Resume uploaded")
                    break
                except Exception:
                    continue
        except Exception:
            pass

        field_values = build_field_values()

        # ====== INPUT FIELDS ======
        print("\n=== Processing Text Fields ===")
        inputs = await root.locator("input").all()
        for inp in inputs:
            try:
                itype = (await inp.get_attribute("type") or "text").lower().strip()
                if itype in ["hidden", "submit", "checkbox", "radio", "file", "button"]:
                    continue

                ctx = await extract_field_context_generic(inp)
                combined = ctx["combined"]
                key = normalize_key(combined)

                if not combined:
                    continue

                # Check saved memory first
                if key in field_memory:
                    await inp.fill(str(field_memory[key]))
                    continue

                # Try fuzzy match with structured data
                best, score = fuzzy_match_field(combined, field_values)
                value = ""
                if best and score >= 60:
                    value = field_values.get(best, "")

                # For unknown fields, ask AI or user
                if not value and itype in ["text", "tel", "url", "search"]:
                    ai_answer, confidence = generate_structured_answer(
                        question=combined or ctx["name"],
                        answer_kind="short_text"
                    )
                    if ai_answer or confidence < 0.5:
                        # Ask user to approve
                        approved = ask_user_for_field(combined, ai_answer, confidence)
                        if approved:
                            value = approved
                            field_memory[key] = value

                if value:
                    await inp.fill("")
                    await inp.fill(value)

            except Exception as e:
                print(f"Input error: {e}")

        # ====== TEXTAREAS ======
        print("\n=== Processing Text Areas ===")
        tareas = await root.locator("textarea").all()
        for ta in tareas:
            try:
                ctx = await extract_field_context_generic(ta)
                question = ctx["combined"]
                if not question:
                    continue

                qkey = normalize_key(question)
                if qkey in field_memory:
                    await ta.fill(field_memory[qkey])
                    continue

                # Generate long answer
                ans, conf = generate_structured_answer(question=question, answer_kind="long_text")
                approved = ask_user_for_field(question, ans, conf)
                if approved:
                    field_memory[qkey] = approved
                    await ta.fill(approved)

            except Exception as e:
                print(f"Textarea error: {e}")

        # ====== DROPDOWNS ======
        print("\n=== Processing Dropdowns ===")
        selects = await root.locator("select").all()
        for sel in selects:
            try:
                ctx = await extract_field_context_generic(sel)
                combined = ctx["combined"]
                if not combined:
                    continue

                options = [normalize_space(o) for o in await sel.locator("option").all_text_contents() if normalize_space(o)]
                if not options:
                    continue

                ckey = normalize_key(combined)
                if ckey in field_memory:
                    choice = field_memory[ckey]
                    await sel.select_option(label=choice)
                    continue

                # Ask AI for choice
                target, conf = generate_structured_answer(
                    question=combined or "Choose option",
                    answer_kind="choice",
                    options=options
                )
                choice = pick_best_option(target, options)
                approved = ask_user_for_field(combined, choice, conf)
                if approved and approved in options:
                    field_memory[ckey] = approved
                    await sel.select_option(label=approved)

            except Exception as e:
                print(f"Dropdown error: {e}")

        # ====== CHECKBOXES ======
        print("\n=== Processing Checkboxes ===")
        checkboxes = await root.locator("input[type='checkbox']").all()
        for cb in checkboxes:
            try:
                ctx = await extract_field_context_generic(cb)
                combined = normalize_key(ctx["combined"])
                if not combined:
                    continue

                # Auto-check terms/privacy/consent
                if any(t in combined for t in ["terms", "privacy", "consent", "certify"]):
                    await cb.check()
                    field_memory[combined] = "checked"

            except Exception:
                continue

        # ====== FINISH ======
        save_company_memory(company_name, field_memory)
        print(f"\n✓ Memory saved for {company_name}")
        print("Review the form before submitting.")
        input("Press ENTER after submitting manually...")


if __name__ == "__main__":
    asyncio.run(apply())
