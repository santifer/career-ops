import json
import re
import os
import subprocess
import shutil

# Load mapping
with open("resume-map.json", "r") as f:
    resume_map = json.load(f)

# Read job description
with open("job_description.txt", "r", encoding="utf-8") as f:
    jd = f.read().lower()

best_match = None
best_score = 0

# Detect best resume
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

# Compile LaTeX
subprocess.run(
    ["pdflatex", "main.tex"],
    cwd=folder
)

# Create output folder
os.makedirs("resumes/generated", exist_ok=True)

# Copy generated PDF
source_pdf = os.path.join(folder, "main.pdf")

target_pdf = os.path.join(
    "resumes/generated",
    "selected_resume.pdf"
)

shutil.copy(source_pdf, target_pdf)

print("\nGenerated Resume:")
print(target_pdf)