import subprocess
import time
import sys
# =========================
# LOAD JOB URLS
# =========================

with open(
    "jobs.txt",
    "r",
    encoding="utf-8"
) as f:

    urls = [
        line.strip()
        for line in f.readlines()
        if line.strip()
    ]

print(f"\nFound {len(urls)} jobs.\n")

# =========================
# PROCESS JOBS
# =========================

for index, url in enumerate(urls, start=1):

    print("=" * 60)
    print(f"Processing Job {index}/{len(urls)}")
    print(url)
    print("=" * 60)

    process = subprocess.run(
    [
        sys.executable,
        "scripts/smart_apply.py"
    ],

    input=url + "\n",
    text=True
)

 

    print("\nJob Completed.")

    # Delay to avoid rate limits
    time.sleep(3)

print("\nAll jobs processed.")