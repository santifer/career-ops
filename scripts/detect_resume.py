import json
import re

# Load resume map
with open("resume-map.json", "r") as f:
    resume_map = json.load(f)

# Load job description
with open("job_description.txt", "r", encoding="utf-8") as f:
    jd = f.read().lower()

best_match = None
best_score = 0

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

print("\nBest Resume Match:")
print(best_match)

print("\nResume Folder:")
print(resume_map[best_match]["folder"])