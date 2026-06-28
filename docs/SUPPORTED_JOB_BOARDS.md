# Supported Job Boards

Career-ops currently ships **21 providers**. Each file in `providers/` (excluding `_`-prefixed helpers) represents one supported board.

| Board | Type | Notes |
|---|---|---|
| Arbeitsagentur | API | German Federal Employment Agency |
| Ashby | API | ATS — company career pages |
| BambooHR | API | ATS — company career pages |
| Breezy | RSS | ATS — company career pages |
| Comeet | API | ATS — company career pages |
| Glints | API | Southeast Asia job board |
| Greenhouse | API | ATS — company career pages |
| IBM | API | IBM careers portal |
| JobStreet | API | Southeast Asia / Australia job board |
| Lever | API | ATS — company career pages |
| Local Parser | API | Parses custom/local portals via `portals.yml` |
| Personio | RSS | ATS — company career pages |
| Recruitee | API | ATS — company career pages |
| Remote OK | RSS | Remote-only job board |
| Remotive | RSS | Remote-only job board |
| SmartRecruiters | API | ATS — company career pages |
| SolidJobs | API | Polish tech job board |
| WeWorkRemotely | RSS | Remote-only job board |
| Workable | RSS | ATS — company career pages |
| Workday | API | ATS — enterprise career pages |
| Working Nomads | RSS | Remote-only job board |

**Types:**
- **API** — JSON REST endpoint (zero scraping, structured data)
- **RSS** — XML feed (fast, low-overhead)
- **Parser** — headless or HTML parser for portals without an API or feed

## Adding a new provider

See [CUSTOMIZATION.md](CUSTOMIZATION.md) for a step-by-step guide on writing a new provider module.
