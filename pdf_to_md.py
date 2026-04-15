#!/usr/bin/env python3
import sys
from PyPDF2 import PdfReader

if len(sys.argv) != 2:
    print("Usage: python pdf_to_md.py <pdf_file>")
    sys.exit(1)

pdf_file = sys.argv[1]
reader = PdfReader(pdf_file)
text = ""
for page in reader.pages:
    text += page.extract_text() + "\n"

# Basic markdown formatting (you can improve this)
md_text = text.replace('\n\n', '\n\n').strip()

# Write to cv.md with utf-8 encoding
with open('cv.md', 'w', encoding='utf-8') as f:
    f.write(md_text)

print("Converted PDF to cv.md")