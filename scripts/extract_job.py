import requests
from bs4 import BeautifulSoup

url = input("Enter Job URL: ")

headers = {
    "User-Agent": "Mozilla/5.0"
}

response = requests.get(url, headers=headers)

html = response.text

with open("job_page.html", "w", encoding="utf-8") as f:
    f.write(html)

print("\nJob page downloaded.")

soup = BeautifulSoup(html, "lxml")

text = soup.get_text(separator=" ")

cleaned = " ".join(text.split())

with open("job_description.txt", "w", encoding="utf-8") as f:
    f.write(cleaned)

print("\nJob description extracted.")