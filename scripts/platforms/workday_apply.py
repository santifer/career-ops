import asyncio
import json
import os
import re
from collections import defaultdict

from dotenv import load_dotenv
from openai import OpenAI
from playwright.async_api import async_playwright
from rapidfuzz import fuzz


# Workday apply automation - adapted from greenhouse_apply.py

load_dotenv()

# Support multiple common env var names for API key (GROQ or OpenAI)
api_key = os.getenv("GROQ_API_KEY") or os.getenv("OPENAI_API_KEY") or os.getenv("OPENAI_API_KEY_ALT")
if not api_key:
    print("Warning: no API key found in GROQ_API_KEY or OPENAI_API_KEY environment variables. AI features will be disabled.")
    client = None
else:
    client = OpenAI(
        api_key=api_key,
        base_url="https://api.groq.com/openai/v1"
    )

with open("applicant.json", "r", encoding="utf-8") as f:
    applicant = json.load(f)

memory_path = "field_memory.json"
if os.path.exists(memory_path):
    with open(memory_path, "r", encoding="utf-8") as f:
        field_memory = json.load(f)
else:
    field_memory = {}

with open("candidate_profile.txt", "r", encoding="utf-8") as f:
    candidate_profile = f.read()

with open("job_description.txt", "r", encoding="utf-8") as f:
    job_description = f.read()

job_url = input("Enter Workday Job URL: ").strip()

resume_path = os.path.abspath("resumes/generated/tailored_resume.pdf")
print(f"\nUsing resume:\n{resume_path}")

# persistent browser profile (absolute path)
browser_profile = os.path.abspath("browser_data")
os.makedirs(browser_profile, exist_ok=True)


def safe_get(key, default=""):
    value = applicant.get(key, default)
    return "" if value is None else str(value).strip()


def normalize_space(text):
    return re.sub(r"\s+", " ", (text or "")).strip()


def normalize_key(text):
    return normalize_space((text or "").lower())


def save_memory():
    with open(memory_path, "w", encoding="utf-8") as f:
        json.dump(field_memory, f, indent=2, ensure_ascii=False)


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
You are an expert job application assistant. Output JSON only: {"{\"answer\":\"string\",\"confidence\":0.0}"}
Candidate profile:
{candidate_profile}
Applicant JSON:
{json.dumps(applicant, ensure_ascii=False, indent=2)}
Job description:
{job_description}
Question:
{question}
Options:
{options_text or 'N/A'}
answer_kind: {answer_kind}
"""

    if client is None:
        print("AI client not configured — skipping AI answer generation.")
        return "", 0.0

    try:
        print("Invoking AI for question:", question[:120])
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=260,
        )
        raw = response.choices[0].message.content.strip()
    except Exception as e:
        print(f"AI call failed: {e}")
        return "", 0.0
    data = parse_json_block(raw)
    if isinstance(data, dict) and "answer" in data:
        return normalize_space(str(data.get("answer", ""))), float(data.get("confidence", 0.5) or 0.5)
    return normalize_space(raw), 0.4


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


async def find_workday_frame(page):
    # Workday often loads application forms in an iframe; try to find a frame containing "workday" or "apply"
    for f in page.frames:
        try:
            url = (f.url or "").lower()
            if "workday" in url or "apply" in url or "recruit" in url:
                return f
        except Exception:
            continue
    return None


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


async def apply():
    generated_cache = {}
    async with async_playwright() as p:
        browser = await p.chromium.launch_persistent_context(user_data_dir=browser_profile, headless=False)
        page = await browser.new_page()
        print("\nOpening Workday job page...")
        await page.goto(job_url, wait_until="networkidle", timeout=120000)
        await page.wait_for_timeout(4000)

        # Detect common login prompts (SSO) and pause to allow manual login in the opened browser
        login_detected = False
        try:
            # look for password input or sign-in text
            if await page.locator("input[type='password']").count() > 0:
                login_detected = True
            elif await page.locator("text=Sign in").count() > 0:
                login_detected = True
            elif await page.locator("text=Sign in with").count() > 0:
                login_detected = True
        except Exception:
            login_detected = False

        if login_detected:
            print("Login required by the site. Please complete login in the opened browser window.")
            input("After you finish logging in, press ENTER to continue the automation...")
            await page.wait_for_timeout(1500)

        # try to find a frame with the application form
        frame = await find_workday_frame(page)
        root = frame or page

        # Click apply button(s) - Workday sites vary
        apply_selectors = ["text=Apply", "text=Apply Now", "button:has-text('Apply')", "a:has-text('Apply')"]
        clicked = False
        for sel in apply_selectors:
            try:
                await page.locator(sel).first.click(timeout=4000)
                clicked = True
                print(f"Clicked: {sel}")
                break
            except Exception:
                continue

        # sometimes Workday opens a modal/iframe after click
        await page.wait_for_timeout(2500)
        frame = await find_workday_frame(page)
        root = frame or page

        # Upload resume if input exists
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

        # Fill input fields
        inputs = await root.locator("input").all()
        for inp in inputs:
            try:
                itype = (await inp.get_attribute("type") or "text").lower().strip()
                if itype in ["hidden", "submit", "checkbox", "radio", "file", "button"]:
                    continue
                ctx = await extract_field_context_generic(inp)
                combined = ctx["combined"]
                key = normalize_key(combined)
                print(f"FIELD -> {combined}")
                if key in field_memory:
                    await inp.fill(str(field_memory[key]))
                    continue
                best, score = fuzzy_match_field(combined, field_values)
                value = ""
                if best and score >= 60:
                    value = field_values.get(best, "")
                elif itype in ["text", "tel", "url", "search"]:
                    cache_key = f"wk::{key}"
                    if cache_key not in generated_cache:
                        generated_cache[cache_key], _ = generate_structured_answer(question=combined or ctx["name"], answer_kind="short_text")
                    value = generated_cache[cache_key]
                if value:
                    await inp.fill("")
                    await inp.fill(value)
                    field_memory[key] = value
                    print(f"Filled -> {value}")
                else:
                    print(f"Skipped -> {combined}")
            except Exception as e:
                print(f"Input error: {e}")

        # Textareas
        tareas = await root.locator("textarea").all()
        for ta in tareas:
            try:
                ctx = await extract_field_context_generic(ta)
                question = ctx["combined"]
                if not question:
                    continue
                ck = f"wk::ta::{normalize_key(question)}"
                if ck not in generated_cache:
                    generated_cache[ck], _ = generate_structured_answer(question=question, answer_kind="long_text")
                ans = generated_cache[ck]
                if ans:
                    await ta.fill(ans)
                    field_memory[normalize_key(question)] = ans
                    print(f"Textarea filled")
            except Exception as e:
                print(f"Textarea error: {e}")

        # Selects
        selects = await root.locator("select").all()
        for sel in selects:
            try:
                ctx = await extract_field_context_generic(sel)
                combined = ctx["combined"]
                options = [normalize_space(o) for o in await sel.locator("option").all_text_contents() if normalize_space(o)]
                if not options:
                    continue
                cache_key = f"wk::sel::{normalize_key(combined)}::{','.join(options)}"
                if cache_key not in generated_cache:
                    generated_cache[cache_key], _ = generate_structured_answer(question=combined or "Choose option", answer_kind="choice", options=options)
                target = generated_cache[cache_key]
                choice = pick_best_option(target, options)
                if choice:
                    await sel.select_option(label=choice)
                    field_memory[normalize_key(combined)] = choice
                    print(f"Selected -> {choice}")
            except Exception as e:
                print(f"Select error: {e}")

        # Radios and checkboxes handled conservatively
        radios = await root.locator("input[type='radio']").all()
        # group radios by name
        groups = defaultdict(list)
        for r in radios:
            try:
                name = normalize_space(await r.get_attribute("name") or "")
                val = normalize_space(await r.get_attribute("value") or "")
                lbl = normalize_space(await r.evaluate("el => (el.closest('label') && (el.closest('label').innerText || '').trim()) || ''"))
                groups[name or f"grp{len(groups)}"].append((r, lbl or val))
            except Exception:
                continue
        for g, opts in groups.items():
            try:
                options = [t for (_, t) in opts]
                cache_key = f"wk::radio::{normalize_key(g)}::{options}"
                if cache_key not in generated_cache:
                    generated_cache[cache_key], _ = generate_structured_answer(question=f"{g} options: {options}", answer_kind="choice", options=options)
                target = generated_cache[cache_key]
                choice = pick_best_option(target, options)
                if choice:
                    for el, text in opts:
                        if normalize_key(text) == normalize_key(choice):
                            await el.check()
                            field_memory[normalize_key(g)] = choice
                            print(f"Radio set -> {choice}")
                            break
            except Exception as e:
                print(f"Radio group error: {e}")

        checkboxes = await root.locator("input[type='checkbox']").all()
        for cb in checkboxes:
            try:
                ctx = await extract_field_context_generic(cb)
                combined = normalize_key(ctx["combined"])
                if any(t in combined for t in ["terms", "privacy", "consent"]):
                    await cb.check()
                    field_memory[combined] = "checked"
                    print(f"Checked -> {combined}")
            except Exception:
                continue

        save_memory()
        print("\nWorkday automation finished. Review before submit.")
        input("Press ENTER after you've reviewed/submitted manually...")


if __name__ == "__main__":
    asyncio.run(apply())
