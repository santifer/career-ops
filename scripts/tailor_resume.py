import os
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

client = OpenAI(
    api_key=os.getenv("GROQ_API_KEY"),
    base_url="https://api.groq.com/openai/v1"
)

with open("job_description.txt", "r", encoding="utf-8") as f:
    job_description = f.read()

with open(
    "resumes/variants/backend_engineer/projects.tex",
    "r",
    encoding="utf-8"
) as f:
    projects = f.read()

messages = [
    {
        "role": "system",
        "content": (
            "You are an expert ATS resume optimizer. "
            "Preserve LaTeX formatting. "
            "Never invent experience."
        )
    },
    {
        "role": "user",
        "content": f"""
Tailor this resume section for the job description.

Return ONLY LaTeX.

JOB DESCRIPTION:
{job_description[:3000]}

RESUME SECTION:
{projects[:3000]}
"""
    }
]

response = client.chat.completions.create(
    model="llama-3.3-70b-versatile",
    messages=messages,
    temperature=0.3,
    max_tokens=1200
)

tailored = response.choices[0].message.content

with open(
    "tailored_projects.tex",
    "w",
    encoding="utf-8"
) as f:
    f.write(tailored)

print("Tailored project section generated.")