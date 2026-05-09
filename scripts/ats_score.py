import os
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

client = OpenAI(
    api_key=os.getenv("GROQ_API_KEY"),
    base_url="https://api.groq.com/openai/v1"
)

# =========================
# LOAD JOB DESCRIPTION
# =========================

with open(
    "job_description.txt",
    "r",
    encoding="utf-8"
) as f:
    job_description = f.read()

# =========================
# LOAD RESUME
# =========================

resume_path = (
    "temp_company_resume/projects.tex"
)

with open(
    resume_path,
    "r",
    encoding="utf-8"
) as f:
    resume_projects = f.read()

# =========================
# BUILD PROMPT
# =========================

prompt = f"""
You are an expert ATS evaluator.

Analyze the alignment between this resume section and the job description.

Return:

1. ATS Match Score (0-100)
2. Strong Matching Areas
3. Missing Skills
4. Resume Strength Summary
5. Final Hiring Fit Recommendation

Rules:
- Be realistic
- Be technically accurate
- Focus on actual keyword and experience alignment
- Do not hallucinate experience
- Keep concise and actionable

Job Description:
{job_description}

Resume:
{resume_projects}
"""

# =========================
# AI ANALYSIS
# =========================

response = client.chat.completions.create(
    model="llama-3.3-70b-versatile",

    messages=[
        {
            "role": "user",
            "content": prompt
        }
    ],

    temperature=0.2,
    max_tokens=700
)

report = response.choices[0].message.content.strip()

# =========================
# SAVE REPORT
# =========================

os.makedirs(
    "resumes/generated/ats_reports",
    exist_ok=True
)

output_path = (
    "resumes/generated/ats_reports/"
    "ats_report.txt"
)

with open(
    output_path,
    "w",
    encoding="utf-8"
) as f:
    f.write(report)

print("\nATS Report Generated:")
print(output_path)