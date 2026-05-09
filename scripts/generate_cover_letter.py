import os
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

client = OpenAI(
    api_key=os.getenv("GROQ_API_KEY"),
    base_url="https://api.groq.com/openai/v1"
)

# =========================
# LOAD FILES
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

with open(
    "templates/cover_letter_prompt.txt",
    "r",
    encoding="utf-8"
) as f:
    template = f.read()

# =========================
# BUILD PROMPT
# =========================

prompt = template.format(
    candidate_profile=candidate_profile,
    job_description=job_description
)

# =========================
# GENERATE COVER LETTER
# =========================

response = client.chat.completions.create(
    model="llama-3.3-70b-versatile",

    messages=[
        {
            "role": "user",
            "content": prompt
        }
    ],

    temperature=0.4,
    max_tokens=700
)

cover_letter = response.choices[0].message.content.strip()

# =========================
# SAVE COVER LETTER
# =========================

os.makedirs(
    "resumes/generated/cover_letters",
    exist_ok=True
)

output_path = (
    "resumes/generated/cover_letters/"
    "cover_letter.txt"
)

with open(
    output_path,
    "w",
    encoding="utf-8"
) as f:
    f.write(cover_letter)

print("\nCover letter generated:")
print(output_path)