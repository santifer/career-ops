import asyncio
import json
import os
import re
from collections import defaultdict

from dotenv import load_dotenv
from openai import OpenAI
from playwright.async_api import async_playwright
from rapidfuzz import fuzz


# Greenhouse apply automation v2 - per-company memory + user approval

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

job_url = input("Enter Greenhouse Job URL: ").strip()


def extract_company_name(url):
    # Greenhouse URLs: https://company.greenhouse.io/...
    match = re.search(r'https?://([^.]+)\.greenhouse\.io', url)
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
        (["last name", "surname", "family name"], "last name"),
        (["full name", "legal name", "candidate name"], "full name"),
        (["email", "e-mail"], "email"),
        (["phone", "mobile", "contact number", "telephone"], "phone"),
        (["linkedin"], "linkedin"),
        (["github"], "github"),
        (["portfolio", "personal website", "website", "personal url"], "portfolio"),
        (["location", "city", "current location"], "location"),
        (["university", "school", "college"], "university"),
        (["degree"], "degree")
    ]

    for patterns, key in exact_checks:
        if any(pattern in combined for pattern in patterns):
            if key in field_values:
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
You are an expert job application assistant.
Return ONLY valid JSON: {{"answer":"string","confidence":0.0}}

Rules:
- Never invent fake experience.
- Keep answers human, concise, and technically specific.
- If answer_kind is "choice", answer must be exactly one of the provided options.
- If answer_kind is "boolean", answer must be "yes" or "no".

Candidate profile:
{candidate_profile}

Applicant JSON:
{json.dumps(applicant, ensure_ascii=False, indent=2)}

Job description:
{job_description}

Question:
{question}

answer_kind: {answer_kind}

Options (if any):
{options_text if options else "N/A"}
"""

    if client is None:
        return "", 0.0

    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=260
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
    cleaned_options = [normalize_space(option) for option in options if normalize_space(option)]

    if not cleaned_options:
        return None

    for option in cleaned_options:
        option_key = normalize_key(option)
        if target and (target in option_key or option_key in target):
            return option

    best = None
    best_score = 0
    for option in cleaned_options:
        score = fuzz.token_sort_ratio(target, normalize_key(option))
        if score > best_score:
            best_score = score
            best = option

    if best_score >= 60:
        return best
    return None


async def extract_field_context(field):
    name_attr = (await field.get_attribute("name") or "").strip()
    placeholder = (await field.get_attribute("placeholder") or "").strip()
    aria_label = (await field.get_attribute("aria-label") or "").strip()
    field_id = (await field.get_attribute("id") or "").strip()

    label_text = ""
    if field_id:
        try:
            label_text = normalize_space(
                await field.page.locator(f"label[for='{field_id}']").first.inner_text(timeout=1000)
            )
        except Exception:
            label_text = ""

    if not label_text:
        try:
            label_text = normalize_space(
                await field.evaluate(
                    """
                    (el) => {
                      const labelledBy = el.getAttribute('aria-labelledby');
                      if (labelledBy) {
                        const ids = labelledBy.split(/\s+/).filter(Boolean);
                        const parts = ids
                          .map((id) => document.getElementById(id))
                          .filter(Boolean)
                          .map((node) => (node.innerText || node.textContent || '').trim())
                          .filter(Boolean);
                        if (parts.length) return parts.join(' ');
                      }
                      const wrapped = el.closest('label');
                      if (wrapped) return (wrapped.innerText || wrapped.textContent || '').trim();
                      const fieldBlock = el.closest('.application-question, .question, .field, .input-wrapper, .form-field');
                      if (fieldBlock) {
                        const heading = fieldBlock.querySelector('label, legend, h3, h4, strong');
                        if (heading) return (heading.innerText || heading.textContent || '').trim();
                      }
                      return '';
                    }
                    """
                )
            )
        except Exception:
            label_text = ""

    combined = normalize_space(" ".join([label_text, name_attr, placeholder, aria_label]))
    return {
        "name": name_attr,
        "placeholder": placeholder,
        "aria_label": aria_label,
        "label": label_text,
        "combined": combined
    }


def build_field_values():
    full_name = safe_get("name")
    name_parts = full_name.split()
    first_name = name_parts[0] if name_parts else ""
    last_name = " ".join(name_parts[1:]) if len(name_parts) > 1 else ""

    portfolio = safe_get("portfolio")
    linkedin = safe_get("linkedin")

    return {
        "first name": first_name,
        "last name": last_name,
        "full name": full_name,
        "name": full_name,
        "legal name": full_name,
        "email": safe_get("email"),
        "phone": safe_get("phone"),
        "mobile": safe_get("phone"),
        "contact number": safe_get("phone"),
        "linkedin": linkedin,
        "github": safe_get("github"),
        "portfolio": portfolio,
        "website": portfolio,
        "personal website": portfolio,
        "website url": portfolio,
        "personal url": portfolio,
        "professional url": linkedin,
        "location": safe_get("location"),
        "city": safe_get("location"),
        "current location": safe_get("location"),
        "university": safe_get("university"),
        "school": safe_get("university"),
        "degree": safe_get("degree")
    }


async def apply():
    async with async_playwright() as p:
        context = await p.chromium.launch_persistent_context(
            user_data_dir=browser_profile,
            headless=False
        )

        page = await context.new_page()

        print("\nOpening Greenhouse page...")

        await page.goto(
            job_url,
            wait_until="networkidle",
            timeout=120000
        )

        await page.wait_for_timeout(5000)

        # Click apply
        print("\nSearching for Apply button...")

        apply_buttons = [
            "text=Apply for this job",
            "text=Apply Now",
            "button:has-text('Apply')",
            "a:has-text('Apply')"
        ]

        clicked = False

        for selector in apply_buttons:
            try:
                await page.locator(selector).first.click(timeout=5000)
                clicked = True
                print(f"Clicked: {selector}")
                break
            except Exception:
                continue

        if not clicked:
            print("\nCould not find Apply button.")
            return

        # Wait for form
        print("\nWaiting for form to load...")
        await page.wait_for_load_state("networkidle")
        await page.wait_for_timeout(8000)

        # Upload resume
        print("\nUploading resume...")
        uploaded = False
        file_inputs = await page.locator("input[type='file']").all()

        for file_input in file_inputs:
            try:
                await file_input.set_input_files(resume_path)
                print("Resume uploaded.")
                uploaded = True
                break
            except Exception as e:
                print(f"Upload error: {e}")

        if uploaded:
            print("\nWaiting for Greenhouse parsing...")
            await page.wait_for_timeout(10000)

        field_values = build_field_values()

        # ====== INPUT FIELDS ======
        print("\n=== Processing Text Fields ===")
        inputs = await page.locator("input").all()

        for input_box in inputs:
            try:
                input_type = (await input_box.get_attribute("type") or "text").lower().strip()
                if input_type in ["hidden", "submit", "checkbox", "radio", "file", "button"]:
                    continue

                context_info = await extract_field_context(input_box)
                combined = context_info["combined"]
                key = normalize_key(combined)

                if not combined:
                    continue

                # Check saved memory first
                if key in field_memory:
                    await input_box.fill(str(field_memory[key]))
                    continue

                best_match, score = fuzzy_match_field(combined, field_values)

                value = ""
                if best_match and score >= 62:
                    value = field_values.get(best_match, "")

                # For unknown fields, ask AI or user
                if not value and input_type in ["text", "search", "url", "tel", "number"]:
                    ai_answer, confidence = generate_structured_answer(
                        question=combined or context_info["name"] or "Short text field",
                        answer_kind="short_text"
                    )
                    if ai_answer:
                        approved = ask_user_for_field(combined, ai_answer, confidence)
                        if approved:
                            value = approved
                            field_memory[key] = value

                if not value and input_type == "email":
                    value = field_values.get("email", "")

                if value:
                    current_value = await input_box.input_value()
                    if normalize_space(current_value) != normalize_space(value):
                        await input_box.fill("")
                        await input_box.fill(value)

            except Exception as e:
                print(f"Field error: {e}")

        # ====== TEXTAREAS ======
        print("\n=== Processing Text Areas ===")
        textareas = await page.locator("textarea").all()

        for textarea in textareas:
            try:
                context_info = await extract_field_context(textarea)
                question = context_info["combined"]
                if not question:
                    continue

                qkey = normalize_key(question)
                if qkey in field_memory:
                    await textarea.fill(field_memory[qkey])
                    continue

                answer, confidence = generate_structured_answer(
                    question=question,
                    answer_kind="long_text"
                )
                approved = ask_user_for_field(question, answer, confidence)
                if approved:
                    field_memory[qkey] = approved
                    await textarea.fill(approved)

            except Exception as e:
                print(f"Textarea error: {e}")

        # ====== DROPDOWNS ======
        print("\n=== Processing Dropdowns ===")
        selects = await page.locator("select").all()

        for select in selects:
            try:
                context_info = await extract_field_context(select)
                combined = context_info["combined"]
                if not combined:
                    continue

                options = [
                    normalize_space(option)
                    for option in await select.locator("option").all_text_contents()
                    if normalize_space(option)
                ]

                if not options:
                    continue

                ckey = normalize_key(combined)
                if ckey in field_memory:
                    choice = field_memory[ckey]
                    await select.select_option(label=choice)
                    continue

                target, confidence = generate_structured_answer(
                    question=context_info["combined"] or "Select the most appropriate option",
                    answer_kind="choice",
                    options=options
                )
                chosen = pick_best_option(target, options)
                approved = ask_user_for_field(combined, chosen, confidence)
                if approved and approved in options:
                    field_memory[ckey] = approved
                    await select.select_option(label=approved)

            except Exception as e:
                print(f"Dropdown error: {e}")

        # ====== CHECKBOXES ======
        print("\n=== Processing Checkboxes ===")
        checkboxes = await page.locator("input[type='checkbox']").all()

        for checkbox in checkboxes:
            try:
                context_info = await extract_field_context(checkbox)
                combined = normalize_key(context_info["combined"])
                if not combined:
                    continue

                # Auto-check terms/privacy/consent/acknowledge
                if any(token in combined for token in ["terms", "privacy", "consent", "certify", "acknowledge"]):
                    await checkbox.check()
                    field_memory[combined] = "checked"

            except Exception:
                continue

        # ====== FINISH ======
        save_company_memory(company_name, field_memory)
        print(f"\n✓ Memory saved for {company_name}")
        print("Review the form before submitting.")
        input("Press ENTER after submitting manually...")


asyncio.run(apply())
