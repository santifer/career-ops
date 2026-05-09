import re
import os
import time
from dotenv import load_dotenv
from openai import OpenAI

# =========================
# LOAD ENV
# =========================

load_dotenv()

client = OpenAI(
    api_key=os.getenv("GROQ_API_KEY"),
    base_url="https://api.groq.com/openai/v1"
)

# =========================
# FILE PATHS
# =========================

JD_PATH = "job_description.txt"
PROJECTS_PATH = "temp_company_resume/projects.tex"

# =========================
# LOAD FILES
# =========================

with open(JD_PATH, "r", encoding="utf-8") as f:
    job_description = f.read()

with open(PROJECTS_PATH, "r", encoding="utf-8") as f:
    content = f.read()

# =========================
# FIND ALL \item BULLETS
# =========================

pattern = r'(\\item\s+)(.*)'

matches = list(re.finditer(pattern, content))

print(f"\nFound {len(matches)} bullets.\n")

# =========================
# LATEX SANITIZER
# =========================

def sanitize_latex(text):
    replacements = {
        "&": r"\&",
        "%": r"\%",
        "$": r"\$",
        "#": r"\#",
        "_": r"\_",
    }

    for old, new in replacements.items():
        text = text.replace(old, new)

    return text

# =========================
# OPTIMIZE BULLETS
# =========================

updated_content = content

offset = 0

for idx, match in enumerate(matches, start=1):

    prefix = match.group(1)
    bullet = match.group(2).strip()

    print(f"Optimizing bullet {idx}...")

    prompt = f"""
You are an expert ATS resume optimizer.

Improve this resume bullet for the provided job description.

Rules:
- Preserve truthfulness
- Never invent technologies
- Keep concise
- Use strong technical wording
- Improve ATS alignment
- Maintain one-line to two-line style
- Use action verbs
- Quantify impact if already present
- Return ONLY improved bullet text
- No markdown
- No explanations

Job Description:
{job_description}

Resume Bullet:
{bullet}
"""

    try:

        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            temperature=0.3,
            max_tokens=120
        )

        optimized = (
            response
            .choices[0]
            .message
            .content
            .strip()
        )

        optimized = sanitize_latex(optimized)

    except Exception as e:

        print(f"Error on bullet {idx}: {e}")

        optimized = bullet

    # Replace using positions
    start, end = match.span(2)

    start += offset
    end += offset

    updated_content = (
        updated_content[:start]
        + optimized
        + updated_content[end:]
    )

    offset += len(optimized) - (end - start)

    time.sleep(1)

# =========================
# SAVE FILE
# =========================

with open(PROJECTS_PATH, "w", encoding="utf-8") as f:
    f.write(updated_content)

print("\nBullet injection complete.")