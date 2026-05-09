import requests
from bs4 import BeautifulSoup
import json
import re
import os
import subprocess
import shutil

# STEP 1 — Get URL
url = input("Enter Job URL: ")

headers = {
    "User-Agent": "Mozilla/5.0"
}

response = requests.get(url, headers=headers)

html = response.text

# STEP 2 — Extract text
soup = BeautifulSoup(html, "lxml")

text = soup.get_text(separator=" ")

cleaned = " ".join(text.split())

# Save JD
with open("job_description.txt", "w", encoding="utf-8") as f:
    f.write(cleaned)

print("\nJob description extracted.")

# STEP 3 — Load resume map
with open("resume-map.json", "r") as f:
    resume_map = json.load(f)

jd = cleaned.lower()

best_match = None
best_score = 0

# STEP 4 — Detect best resume
for role, data in resume_map.items():

    score = 0

    for keyword in data["keywords"]:

        pattern = r"\b" + re.escape(keyword.lower()) + r"\b"

        matches = re.findall(pattern, jd)

        score += len(matches)

    print(f"{role}: {score}")

    if score > best_score:
        best_score = score
        best_match = role

print(f"\nSelected Resume: {best_match}")

folder = resume_map[best_match]["folder"]

# STEP 5 — Compile LaTeX
subprocess.run(
    ["pdflatex", "main.tex"],
    cwd=folder
)

# STEP 6 — Export generated PDF
os.makedirs("resumes/generated", exist_ok=True)

source_pdf = os.path.join(folder, "main.pdf")

target_pdf = os.path.join(
    "resumes/generated",
    "selected_resume.pdf"
)

shutil.copy(source_pdf, target_pdf)

print("\nGenerated Resume:")
print(target_pdf)