# Mode: cover-letter — Cover Letter Generation

When the user asks to generate a cover letter for a specific job limit:

## Step 1 — Information Gathering
1. Read `cv.md` to understand the user's background, core skills, and tone.
2. Read the target job description (via URL provided or text). If it's a URL, use Playwright to fetch the JD text.
3. If an existing `reports/` evaluation markdown file exists for this company, load it. It contains the identified archetype, matches, and gaps.

## Step 2 — Strategy & Framing
Identify the 3 most critical needs of the job description.
Determine which 3 experiences from `cv.md` match these needs closest.
If there are gaps, rely on adjacent skills to frame a narrative of fast learning or complementary value.

## Step 3 — Generation Rules
- **Length:** STRICTLY 3-4 paragraphs. Maximum 300 words. Recruiter time is scarce.
- **Tone:** Professional, direct, confident. NOT desperate, NOT overly formal ("Dear hiring manager" is okay, avoid "Yours faithfully").
- **Hook:** Start strong. Don't say "I am applying for X". They know. Say "With X years building Y, I can help [Company] achieve Z."
- **Body:** Use bullet points for impact if appropriate. Quantify achievements ($, %, time saved).
- **Closing:** Call to action. "I'd welcome a brief chat about how my experience launching X applies to your upcoming Y initiative."

## Step 4 — Output
Print the cover letter block formatted clearly.
Also save it to `output/cover-letter-{company-slug}.md` for the user to copy.
Provide instructions on how to export it to PDF if they need to (`pandoc` or similar).
