import asyncio
import json
import os
import re
from collections import defaultdict

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
# LOAD FIELD MEMORY
# =========================

memory_path = "field_memory.json"

if os.path.exists(memory_path):
    with open(
        memory_path,
        "r",
        encoding="utf-8"
    ) as f:
        field_memory = json.load(f)
else:
    field_memory = {}


# =========================
# LOAD PROFILE + JD
# =========================

with open(
    "candidate_profile.txt",
    "r",
    encoding="utf-8"
) as f:
    candidate_profile = f.read()

with open(
    "job_description.txt",
    "r",
    encoding="utf-8"
) as f:
    job_description = f.read()


# =========================
# INPUTS
# =========================

job_url = input(
    "Enter Greenhouse Job URL: "
).strip()

resume_path = os.path.abspath(
    "resumes/generated/tailored_resume.pdf"
)

print(f"\nUsing resume:\n{resume_path}")


# =========================
# HELPERS
# =========================

def safe_get(key, default=""):
    value = applicant.get(key, default)
    return "" if value is None else str(value).strip()


def normalize_space(text):
    return re.sub(r"\s+", " ", (text or "")).strip()


def normalize_key(text):
    return normalize_space((text or "").lower())


def save_memory():
    with open(
        memory_path,
        "w",
        encoding="utf-8"
    ) as f:
        json.dump(
            field_memory,
            f,
            indent=2,
            ensure_ascii=False
        )


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

Return ONLY valid JSON in this exact shape:
{{
  "answer": "string",
  "confidence": 0.0
}}

Rules:
- Never invent fake experience.
- Keep answers human, concise, and technically specific.
- If answer_kind is "choice", answer must be exactly one of the provided options.
- If answer_kind is "boolean", answer must be "yes" or "no".
- Use candidate profile and applicant data as source of truth.

Candidate profile:
{candidate_profile}

Applicant JSON:
{json.dumps(applicant, ensure_ascii=False, indent=2)}

Job description:
{job_description}

Question:
{question}

answer_kind:
{answer_kind}

Options (if any):
{options_text if options else "N/A"}
"""

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {
                "role": "user",
                "content": prompt
            }
        ],
        temperature=0.2,
        max_tokens=260
    )

    raw = (
        response
        .choices[0]
        .message
        .content
        .strip()
    )

    data = parse_json_block(raw)
    if isinstance(data, dict) and "answer" in data:
        return normalize_space(str(data.get("answer", ""))), float(data.get("confidence", 0.5) or 0.5)

    return normalize_space(raw), 0.4


def pick_best_option(target_value, options):
    target = normalize_key(target_value)
    cleaned_options = [normalize_space(option) for option in options if normalize_space(option)]

    if not cleaned_options:
        return None

    # First try direct containment both ways for resilient matching.
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


# =========================
# MAIN AUTOMATION
# =========================

async def apply():
    generated_answer_cache = {}

    async with async_playwright() as p:
        context = await p.chromium.launch_persistent_context(
            user_data_dir="browser_data",
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

        # =========================
        # CLICK APPLY
        # =========================

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

        # =========================
        # WAIT FOR FORM LOAD
        # =========================

        print("\nWaiting for form to load...")
        await page.wait_for_load_state("networkidle")
        await page.wait_for_timeout(8000)

        # =========================
        # RESUME UPLOAD
        # =========================

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

        # =========================
        # INPUT FIELDS
        # =========================

        print("\nDetecting input fields...")
        inputs = await page.locator("input").all()
        print(f"\nFound {len(inputs)} input fields.\n")

        for input_box in inputs:
            try:
                input_type = (await input_box.get_attribute("type") or "text").lower().strip()
                if input_type in ["hidden", "submit", "checkbox", "radio", "file", "button"]:
                    continue

                context_info = await extract_field_context(input_box)
                combined = context_info["combined"]
                key = normalize_key(combined)

                print(f"FIELD -> {combined}")

                if key in field_memory:
                    remembered = str(field_memory[key])
                    await input_box.fill(remembered)
                    print(f"Used memory -> {remembered}")
                    continue

                best_match, score = fuzzy_match_field(combined, field_values)
                print(f"BEST MATCH -> {best_match} ({score})")

                matched = False
                value = ""

                if best_match and score >= 62:
                    value = field_values.get(best_match, "")
                    matched = bool(value)

                # AI fallback for unknown text/url fields.
                if not matched and input_type in ["text", "search", "url", "tel", "number"]:
                    ai_key = f"text::{key}"
                    if ai_key not in generated_answer_cache:
                        generated_answer_cache[ai_key], _ = generate_structured_answer(
                            question=combined or context_info["name"] or "Short application field",
                            answer_kind="short_text"
                        )
                    value = generated_answer_cache[ai_key]
                    matched = bool(value)

                if not matched and input_type == "email":
                    value = field_values.get("email", "")
                    matched = bool(value)

                if matched and value:
                    current_value = await input_box.input_value()
                    if normalize_space(current_value) != normalize_space(value):
                        await input_box.fill("")
                        await input_box.fill(value)
                    field_memory[key] = value
                    print(f"FINAL -> {value}")
                else:
                    print(f"Skipping unknown field -> {combined}")

            except Exception as e:
                print(f"Field error: {e}")

        # =========================
        # TEXTAREA ANSWERS
        # =========================

        print("\nScanning textareas...")
        textareas = await page.locator("textarea").all()
        print(f"Found {len(textareas)} textareas.")

        for textarea in textareas:
            try:
                context_info = await extract_field_context(textarea)
                question = context_info["combined"]
                if not question:
                    continue

                cache_key = f"textarea::{normalize_key(question)}"
                if cache_key not in generated_answer_cache:
                    answer, _ = generate_structured_answer(
                        question=question,
                        answer_kind="long_text"
                    )
                    generated_answer_cache[cache_key] = answer

                answer = generated_answer_cache[cache_key]
                if answer:
                    print(f"\nQUESTION -> {question}")
                    print(f"Generated Answer -> {answer}")
                    await textarea.fill(answer)
                    field_memory[normalize_key(question)] = answer

            except Exception as e:
                print(f"Textarea error: {e}")

        # =========================
        # DROPDOWNS
        # =========================

        print("\nHandling dropdowns...")
        selects = await page.locator("select").all()

        dropdown_map = {
            "work authorization": safe_get("work_authorization"),
            "authorized": safe_get("authorized_to_work"),
            "sponsorship": safe_get("require_sponsorship"),
            "experience": safe_get("years_experience"),
            "degree": safe_get("degree")
        }

        for select in selects:
            try:
                context_info = await extract_field_context(select)
                combined = normalize_key(context_info["combined"])
                print(f"DROPDOWN -> {combined}")

                options = [
                    normalize_space(option)
                    for option in await select.locator("option").all_text_contents()
                    if normalize_space(option)
                ]

                if not options:
                    continue

                target = ""
                for key, value in dropdown_map.items():
                    if key in combined and value:
                        target = value
                        break

                if not target:
                    cache_key = f"select::{combined}::{','.join(options)}"
                    if cache_key not in generated_answer_cache:
                        generated_answer_cache[cache_key], _ = generate_structured_answer(
                            question=context_info["combined"] or "Select the most appropriate option",
                            answer_kind="choice",
                            options=options
                        )
                    target = generated_answer_cache[cache_key]

                chosen = pick_best_option(target, options)
                if chosen:
                    await select.select_option(label=chosen)
                    field_memory[combined] = chosen
                    print(f"Selected -> {chosen}")
                else:
                    print(f"No reliable option match for -> {combined}")

            except Exception as e:
                print(f"Dropdown error: {e}")

        # =========================
        # RADIO GROUPS
        # =========================

        print("\nHandling radio buttons...")
        radios = await page.locator("input[type='radio']").all()
        radio_groups = defaultdict(list)

        for radio in radios:
            try:
                name = normalize_space(await radio.get_attribute("name") or "")
                value = normalize_space(await radio.get_attribute("value") or "")
                label = normalize_space(
                    await radio.evaluate(
                        """
                        (el) => {
                          const wrapped = el.closest('label');
                          if (wrapped) return (wrapped.innerText || wrapped.textContent || '').trim();
                          const id = el.getAttribute('id');
                          if (id) {
                            const lbl = document.querySelector(`label[for='${id}']`);
                            if (lbl) return (lbl.innerText || lbl.textContent || '').trim();
                          }
                          const row = el.closest('.application-question, .question, .field, fieldset');
                          if (!row) return '';
                          const legend = row.querySelector('legend');
                          if (legend) return (legend.innerText || legend.textContent || '').trim();
                          return '';
                        }
                        """
                    )
                )

                key = name or f"unnamed::{len(radio_groups)}"
                radio_groups[key].append({
                    "el": radio,
                    "value": value,
                    "label": label
                })
            except Exception as e:
                print(f"Radio parse error: {e}")

        for group_name, options_data in radio_groups.items():
            try:
                options = [item["label"] or item["value"] for item in options_data]
                group_prompt = f"{group_name} | options: {options}"
                group_key = normalize_key(group_prompt)

                target = ""
                low = group_key.lower()
                if any(token in low for token in ["authorized", "eligible", "legal"]):
                    target = "yes"
                elif "sponsor" in low:
                    target = "no"

                if not target:
                    cache_key = f"radio::{group_key}"
                    if cache_key not in generated_answer_cache:
                        generated_answer_cache[cache_key], _ = generate_structured_answer(
                            question=group_prompt,
                            answer_kind="choice",
                            options=options
                        )
                    target = generated_answer_cache[cache_key]

                chosen = pick_best_option(target, options)
                if not chosen:
                    continue

                for option_data in options_data:
                    text = option_data["label"] or option_data["value"]
                    if normalize_key(text) == normalize_key(chosen):
                        await option_data["el"].check()
                        print(f"RADIO -> {group_name} = {chosen}")
                        field_memory[group_key] = chosen
                        break

            except Exception as e:
                print(f"Radio error: {e}")

        # =========================
        # CHECKBOXES
        # =========================

        print("\nHandling checkboxes...")
        checkboxes = await page.locator("input[type='checkbox']").all()

        for checkbox in checkboxes:
            try:
                context_info = await extract_field_context(checkbox)
                combined = normalize_key(context_info["combined"])
                required = (await checkbox.get_attribute("required")) is not None
                should_check = False

                if any(token in combined for token in ["terms", "privacy", "consent", "certify", "acknowledge"]):
                    should_check = True
                elif required:
                    answer, _ = generate_structured_answer(
                        question=context_info["combined"] or "Required checkbox",
                        answer_kind="boolean"
                    )
                    should_check = normalize_key(answer) in ["yes", "true", "1"]

                if should_check:
                    await checkbox.check()
                    print(f"CHECKBOX -> checked ({combined})")
                    field_memory[combined] = "checked"
                else:
                    print(f"CHECKBOX -> left unchanged ({combined})")

            except Exception as e:
                print(f"Checkbox error: {e}")

        save_memory()

        # =========================
        # FINISHED
        # =========================

        print("\nAutomation completed.")
        print("Review manually before submitting.")
        input("\nPress ENTER after submitting manually...")


asyncio.run(apply())