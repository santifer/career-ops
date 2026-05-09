import os
import json
import re
import shutil
import subprocess
import asyncio
from playwright.async_api import async_playwright
import csv
from datetime import datetime
from bs4 import BeautifulSoup
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
# GET JOB URL
# =========================

url = input("Enter Job URL: ")

# =========================
# PLAYWRIGHT EXTRACTION
# =========================

async def fetch_html(job_url):

    async with async_playwright() as p:

        browser = await p.chromium.launch(
            headless=False
        )

        page = await browser.new_page()

        await page.goto(
            job_url,
            wait_until="networkidle",
            timeout=120000
        )

        await page.wait_for_timeout(5000)

        html_content = await page.content()

        await browser.close()

        return html_content


html = asyncio.run(fetch_html(url))
# =========================
# EXTRACT COMPANY NAME
# =========================

title = BeautifulSoup(html, "html.parser").title

if title:

    raw_title = title.text.strip()

    # Wellfound cleanup
    if "|" in raw_title:
        company_name = raw_title.split("|")[0].strip()

    # YC cleanup
    elif " at " in raw_title.lower():
        company_name = raw_title.split(" at ")[-1].strip()

    # Greenhouse fallback
    elif "-" in raw_title:
        company_name = raw_title.split("-")[0].strip()

    else:
        company_name = raw_title

else:
    company_name = "company"

company_name = re.sub(
    r'[^a-zA-Z0-9_]',
    '_',
    company_name
)

company_name = re.sub(
    r'[^a-zA-Z0-9_]',
    '_',
    company_name
)

print(f"\nCompany Detected: {company_name}")
# =========================
# EXTRACT JOB DESCRIPTION
# =========================

soup = BeautifulSoup(html, "lxml")

# =========================
# BETTER TEXT EXTRACTION
# =========================

for script in soup(["script", "style", "noscript"]):
    script.extract()

text = soup.get_text(separator=" ")

cleaned = " ".join(text.split())

job_description = cleaned

print("\nExtracted JD Preview:\n")
print(job_description[:1000])

job_description = " ".join(text.split())

with open(
    "job_description.txt",
    "w",
    encoding="utf-8"
) as f:
    f.write(job_description)

print("\nJob description extracted.")

# =========================
# LOAD RESUME MAP
# =========================

with open("resume-map.json", "r") as f:
    resume_map = json.load(f)

jd_lower = job_description.lower()

best_match = None
best_score = 0
startup_keywords = [
    "startup",
    "product engineer",
"platform",
"generalist",
"full stack",
"startup environment"
    "founding engineer",
    "early stage",
    "series a",
    "seed stage",
    "fast-paced",
    "0 to 1",
    "ownership"
]

startup_score = 0

for keyword in startup_keywords:

    if keyword in jd_lower:
        startup_score += 1

print(f"\nStartup Score: {startup_score}")
# =========================
# DETECT BEST RESUME
# =========================

for role, data in resume_map.items():

    score = 0

    for keyword in data["keywords"]:

        pattern = r"\b" + re.escape(keyword.lower()) + r"\b"

        matches = re.findall(pattern, jd_lower)

        score += len(matches)

    print(f"{role}: {score}")

    if score > best_score:
        best_score = score
        best_match = role

print(f"\nSelected Resume: {best_match}")
# =========================
# FALLBACK RESUME
# =========================

if best_match is None:

    print("\nNo strong keyword match found.")
    print("Using Full Stack AI fallback resume.")

    best_match = "Full Stack AI"

resume_folder = resume_map[best_match]["folder"]

# =========================
# LOAD PROJECT SECTION
# =========================

projects_path = os.path.join(
    resume_folder,
    "projects.tex"
)

with open(
    projects_path,
    "r",
    encoding="utf-8"
) as f:
    projects = f.read()

# =========================
# AI TAILORING
# =========================

prompt = f"""
You are an expert ATS resume optimizer.Prefer startup-oriented technical wording emphasizing ownership, scalability, rapid execution, and product impact.

TASKS:
- Tailor resume bullets to the job description
- Improve ATS keyword alignment
- Preserve LaTeX formatting
- Never invent experience
- Never add technologies not present
- Keep concise technical wording
- Maintain one-page resume style

CRITICAL RULES:
- Return ONLY raw LaTeX code
- Do NOT include markdown
- Do NOT include explanations
- Do NOT wrap output in triple backticks
- Do NOT add headings
- Do NOT use # symbols
- Do NOT change LaTeX structure
- Only improve bullet wording


Job Description:
{job_description}

Resume Projects:
{projects}
"""

response = client.chat.completions.create(
    model="llama-3.3-70b-versatile",
    messages=[
        {
            "role": "user",
            "content": prompt
        }
    ], 
      max_tokens=1200,
      temperature=0.3
)

tailored_projects = response.choices[0].message.content

# =========================
# CLEAN MODEL OUTPUT
# =========================

tailored_projects = tailored_projects.replace(
    "```latex",
    ""
)

tailored_projects = tailored_projects.replace(
    "```",
    ""
)

tailored_projects = tailored_projects.strip()

# =========================
# CREATE TEMP COMPANY FOLDER
# =========================

company_folder = "temp_company_resume"

if os.path.exists(company_folder):
    shutil.rmtree(company_folder)

shutil.copytree(
    resume_folder,
    company_folder
)
# =========================
# BACKUP ORIGINAL PROJECTS
# =========================

backup_path = os.path.join(
    company_folder,
    "projects_backup.tex"
)

shutil.copy(
    os.path.join(company_folder, "projects.tex"),
    backup_path
)
# =========================
# REPLACE PROJECT SECTION
# =========================

with open(
    os.path.join(company_folder, "projects.tex"),
    "w",
    encoding="utf-8"
) as f:
    f.write(tailored_projects)

print("\nTailored projects injected.")

# =========================
# COMPILE LATEX
# =========================

compile_result = subprocess.run(
    ["pdflatex", "main.tex"],
    cwd=company_folder,
    capture_output=True,
    text=True
)

if compile_result.returncode != 0:

    print("\nLaTeX Compilation Failed:")
    print(compile_result.stderr)

    exit()
# =========================
# EXPORT FINAL PDF
# =========================

os.makedirs(
    "resumes/generated",
    exist_ok=True
)

final_pdf = os.path.join(
    company_folder,
    "main.pdf"
)

output_pdf = os.path.join(
    "resumes/generated/companies",
    f"{company_name}_resume.pdf"
)

shutil.copy(final_pdf, output_pdf)

print("\nFinal tailored resume generated:")
print(output_pdf)

# =========================
# TRACK APPLICATION
# =========================

tracker_file = "tracker/applications.csv"

today = datetime.now().strftime("%Y-%m-%d")

with open(
    tracker_file,
    "a",
    encoding="utf-8"
) as csvfile:

    csvfile.write("\n")

    writer = csv.writer(csvfile)

    writer.writerow([
        company_name,
        best_match,
        url,
        today,
        output_pdf,
        "Applied"
    ])

print("\nApplication tracked.")