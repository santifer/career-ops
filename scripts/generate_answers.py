import os
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

client = OpenAI(
    api_key=os.getenv("GROQ_API_KEY"),
    base_url="https://api.groq.com/openai/v1"
)

# =========================
# LOAD CONTEXT
# =========================

with open(
    "job_description.txt",
    "r",
    encoding="utf-8"
) as f:

    job_description = f.read()

with open(
    "candidate_profile.txt",
    "r",
    encoding="utf-8"
) as f:

    candidate_profile = f.read()

# =========================
# INPUT QUESTION
# =========================

question = input(
    "\nEnter application question:\n"
)

# =========================
# BUILD PROMPT
# =========================

prompt = f"""
You are an expert startup job application assistant.

Generate a concise, technically strong answer.

Rules:
- Sound human
- Sound confident
- Avoid corporate buzzwords
- Avoid sounding AI-generated
- Be concise
- Be startup-oriented
- Mention relevant technical experience naturally
- Preserve honesty
- Never invent fake experience

Candidate Profile:
{candidate_profile}

Job Description:
{job_description}

Question:
{question}
"""

# =========================
# GENERATE ANSWER
# =========================

response = client.chat.completions.create(

    model="llama-3.3-70b-versatile",

    messages=[
        {
            "role": "user",
            "content": prompt
        }
    ],

    temperature=0.5,
    max_tokens=400
)

answer = (
    response
    .choices[0]
    .message
    .content
    .strip()
)

# =========================
# OUTPUT
# =========================

print("\nGenerated Answer:\n")
print(answer)