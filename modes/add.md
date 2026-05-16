# Mode: add — Add New Content to CV

Add a project, experience, publication, or skill to `cv.md` and `article-digest.md` so every future CV generation includes it.

## Input Formats

The user can pass:
- **GitHub URL** — `https://github.com/user/repo`
- **Project/portfolio page URL** — any public URL describing a project
- **Research paper URL** — arXiv, ACL, IEEE, journal page
- **Plain text** — freeform description of a project, role, or skill to add

Multiple items can be passed in one call separated by commas or newlines.

## Pipeline

### Step 1 — Classify the input

For each item, determine its type:

| Signal | Classification |
|--------|----------------|
| `github.com` URL | **project** (fetch repo info + README) |
| arXiv / ACL / DOI / journal URL | **publication** |
| Company name + role + dates in text | **experience** |
| Tech list (comma-separated tools/languages) | **skill** |
| Any other URL or rich description | **project** |

### Step 1b — Validate URLs (security check)

Before fetching any URL, validate it:

- **Allowed schemes only:** `http` and `https`. Reject anything else (`file://`, `ftp://`, `data:`, etc.).
- **Reject non-routable hosts:** Do not fetch localhost, `127.0.0.1`, `0.0.0.0`, `::1`, or any hostname resolving to:
  - RFC 1918 private ranges: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`
  - Link-local: `169.254.0.0/16`, `fe80::/10`
  - Loopback or unspecified addresses
- If a URL fails validation, **do not fetch it** — tell the user: "That URL cannot be fetched (private or non-HTTP address). Please paste the content directly."

### Step 2 — Fetch content (for URLs)

**GitHub repos:**
1. Use WebFetch to `https://api.github.com/repos/{owner}/{repo}` — extract: `description`, `language`, `topics`, `stargazers_count`, `html_url`
2. Use WebFetch on the branch-agnostic GitHub API endpoint `https://api.github.com/repos/{owner}/{repo}/readme` — the API returns the default branch README without needing to know the branch name. Decode the `content` field (base64) and extract tech stack, features, key outcomes.
3. If both fail, use WebFetch on the HTML page directly

**Other URLs:**
1. Try `browser_navigate` + `browser_snapshot` (Playwright) to render JS-heavy pages
2. Fall back to WebFetch for static pages

**Never invent content.** Only use what is demonstrably on the page. If a page is inaccessible, ask the user to paste the description manually.

### Step 3 — Extract structured data

Extract as much as available. Mark missing fields as `null`:

```yaml
name:         (string) project/company/paper name
type:         project | experience | publication | skill
url:          (string|null) canonical URL
dates:        (string|null) e.g. "Jan 2025 – Mar 2025" or "2024"
tech_stack:   (string[]|null) languages, frameworks, tools
description:  (string) 1-2 sentence summary
bullets:      (string[]) 2-4 achievement bullets — quantified where possible
hero_metric:  (string|null) the single best proof point (e.g. "84% accuracy", "2K stars")
```

**For publications:** also extract `venue` (conference/journal name) and `co-authors`.
**For experience:** also extract `company`, `location`, `role_title`.

### Step 4 — Generate bullets

Write 2-4 bullets using the same style as the existing `cv.md`:
- Action verb first, past tense (present tense only for current roles)
- Quantify outcomes where the source provides numbers
- NEVER invent metrics — use what is on the page or leave unquantified
- Keep it concise and ATS-friendly (no buzzwords)

Example transformation:
> README says "used PyTorch to train a model that classifies 10K images per second"
→ `Trained PyTorch image classifier achieving 10K img/sec throughput`

### Step 5 — Show a preview and ask for confirmation

Before writing anything, display a formatted preview:

```text
── PREVIEW ──────────────────────────────────────

[PROJECT] Semantic Search Engine
URL: https://github.com/janesmith/semantic-search
Dates: Jan 2025 – Mar 2025
Tech: Python, PyTorch, FAISS, FastAPI
Bullets:
  • Built semantic search engine over 500K documents using dense retrieval (FAISS + bi-encoder)
  • Reduced average query latency from 420ms to 38ms via quantized embeddings
  • Deployed as FastAPI service with 99.9% uptime over 90-day production run

This will be added to:
  → cv.md (Projects section)
  → article-digest.md (proof points)

Proceed? [yes / edit / skip]
─────────────────────────────────────────────────
```

- **yes / y** → write to files
- **edit** → ask what to change, then show preview again
- **skip / no** → skip this item, move to next

### Step 6 — Write to cv.md

Locate the correct section by type:

| Type | Section in cv.md |
|------|-----------------|
| `project` | `## Projects` |
| `experience` | `## Experience` |
| `publication` | `## Experience` (or `## Publications` if it exists) |
| `skill` | `## Technical Skills` (merge into existing categories) |
| `education` | `## Education` |

**NEVER duplicate.** Before adding, check if the project/company/role name already appears in cv.md. If it does, ask the user whether to update the existing entry or skip.

**Format for projects** (match existing cv.md style):

```markdown
### {name} | {dates}
**Technologies:** {tech_stack joined by ", "}
- {bullet 1}
- {bullet 2}
- {bullet 3}
```

**Format for experience:**

```markdown
### {role_title} | {dates}
**{company}**
- {bullet 1}
- {bullet 2}
- {bullet 3}
```

**Format for publications:**

```markdown
### {title} | {year}
**{venue}** — co-authored with {co-authors}
- {contribution bullet}
- URL: {url}
```

**Format for skills** — merge into the existing `**Category:**` lines. If the tech doesn't fit an existing category, add a new one.

**Placement within section:** Add new projects/experience at the TOP of their section (most recent first). Skills are merged alphabetically within each category.

### Step 7 — Write to article-digest.md

If `article-digest.md` does not exist, create it with this header:

```markdown
# Article & Project Digest

Compact proof points for use during CV generation and evaluations.
```

Append a new entry:

```markdown
## {name}

- **Type:** {type}
- **URL:** {url}
- **Dates:** {dates}
- **Tech:** {tech_stack}
- **Hero metric:** {hero_metric}
- **Summary:** {description}
- **Proof points:**
  - {bullet 1}
  - {bullet 2}
  - {bullet 3}
```

### Step 8 — Confirm and summarize

After writing, report:

```text
✅ Added to cv.md:
   → Projects: Semantic Search Engine (Jan 2025 – Mar 2025)

✅ Added to article-digest.md:
   → Semantic Search Engine — hero metric: "38ms query latency"

Future CVs will now include this project and prioritize it for relevant roles.
```

---

## Rules

- **NEVER invent data** that is not on the source page or provided by the user
- **NEVER overwrite** existing entries — only add or merge
- **ALWAYS confirm** before writing (Step 5)
- **Data goes to cv.md and article-digest.md** — these are user-layer files, correct by design
- If the URL is inaccessible, ask the user to paste the content instead of guessing
- If dates are unknown, omit them rather than guessing
- Run `node cv-sync-check.mjs` silently after writing and report any warnings
