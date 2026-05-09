import os
import shutil
import subprocess

RESUME_VARIANTS = {
    "ai": "resumes/variants/ai_engineer",
    "backend": "resumes/variants/backend_engineer",
    "fullstack": "resumes/variants/fullstack_ai"
}

OUTPUT_DIR = "resumes/generated"

os.makedirs(OUTPUT_DIR, exist_ok=True)

for role, folder in RESUME_VARIANTS.items():

    print(f"\nCompiling {role} resume...")

    subprocess.run(
        ["pdflatex", "main.tex"],
        cwd=folder
    )

    pdf_source = os.path.join(folder, "main.pdf")

    pdf_target = os.path.join(
        OUTPUT_DIR,
        f"{role}_resume.pdf"
    )

    shutil.copy(pdf_source, pdf_target)

    print(f"Saved: {pdf_target}")