# Mode: status -- Setup Completeness and System Readiness

When the user asks "how ready am I?", "what's my setup status?", "career-ops status",
or any variant, show the current state of their career-ops installation.

## Step 1 -- Check All Setup Files

Check existence of each file silently. For profile.yml and _profile.md,
also check whether they contain example/template data vs real user data.

| File | Check | How to verify |
|------|-------|---------------|
| `cv.md` | exists + length > 100 chars | `existsSync` + content length |
| `config/profile.yml` | exists + not example data | exists + does NOT contain `"Jane Smith"` |
| `modes/_profile.md` | exists + customized | exists + has user-specific content (not just template) |
| `portals.yml` | exists | `existsSync` in project root |
| `article-digest.md` | exists (optional) | `existsSync` |
| `interview-prep/story-bank.md` | exists (optional) | `existsSync` |
| `data/applications.md` | exists | `existsSync` |
| `data/pipeline.md` | exists (optional) | `existsSync` |

## Step 2 -- Cross-Validation

If both `portals.yml` and `config/profile.yml` exist, check consistency:
- Do `title_filter.positive` keywords in portals.yml align with
  `target_roles.primary` in profile.yml?
- If target roles mention "Backend Engineer" but title_filter has no
  "Backend" keyword, warn: "Your portal scanner may miss roles matching
  your target. Consider adding 'Backend' to title_filter.positive in portals.yml."

## Step 3 -- Display Status Table

Format the output as:

```
career-ops setup status
========================

CORE (required for full pipeline)
  [checkmark] cv.md                    -- Enables: evaluations, PDFs, form answers
  [checkmark] config/profile.yml       -- Enables: PDF personalization, comp benchmarks
  [  ] modes/_profile.md          -- Enables: archetype framing, negotiation scripts
                                     Impact: evaluations use generic framing

DISCOVERY
  [checkmark] portals.yml              -- Enables: portal scanning, batch discovery
  [  ] data/pipeline.md           -- Enables: URL inbox processing
                                     Impact: no URL inbox (paste URLs directly instead)

ENRICHMENT (optional, improves quality)
  [  ] article-digest.md          -- Enables: detailed proof points, richer PDFs
  [  ] interview-prep/story-bank.md -- Enables: STAR+R story accumulation

TRACKING
  [checkmark] data/applications.md     -- Enables: application history, scan dedup

CROSS-VALIDATION
  [!] portals.yml title_filter does not include "Backend" from your target roles.
      Consider adding it to title_filter.positive.

READINESS: 5/8 files present. Core pipeline ready.
Next step: Create article-digest.md to improve evaluation quality.
            Run: "I want to add my proof points" and I'll help you build it.
```

Use [checkmark] for present files, [  ] for missing, [!] for warnings.

## Step 4 -- Suggest Next Action

Based on what is missing, suggest the single highest-impact next step:

1. If cv.md missing: "Create your CV first -- everything depends on it."
2. If profile.yml missing: "Set up your profile so PDFs have your real contact info."
3. If _profile.md is template-only: "Tell me about your career and I'll personalize your archetypes."
4. If portals.yml missing: "Set up portal scanning to discover jobs automatically."
5. If article-digest.md missing: "Share your portfolio articles and I'll extract proof points."
6. If story-bank.md missing: "This builds automatically as you evaluate offers. Run your first evaluation!"
7. If cross-validation warning: surface the specific mismatch.
8. All present: "You're fully set up. Paste a job URL to evaluate, or run /career-ops scan."

## Rules

- Run this check silently (no verbose file-by-file narration)
- Show the table, then the suggestion
- Do NOT re-enter onboarding mode -- just show status and suggest
- If user asks to fix something from the status, help them directly
