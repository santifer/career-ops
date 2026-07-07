# Phase 2: Translate Research & Strategy Modes - Context

**Status:** Ready for planning

<domain>
## Phase Boundary

Translate `interview-prep.md`, `deep.md`, `contacto.md`, `ofertas.md` (compare offers), `patterns.md`, and `followup.md` into Turkish under `modes/tr/`, maintaining the same constraints and tone rules as Phase 1.

</domain>

<decisions>
## Implementation Decisions

### Filename Strategy
- **D-01:** Keep original filenames (`modes/tr/ofertas.md`, `modes/tr/contacto.md`) so the CLI router works without code changes. Do not rename them to `teklifler.md` or `iletisim.md`.

### Terminology Handling
- **D-02:** Keep industry-specific terms in English (e.g., "STAR formatı", "follow-up yap") since they are standard tech industry terms.

### Prior Phase Constraints (Carried Over)
- **D-03:** Use direct/commanding imperative tone (Sen). No polite/plural forms ("-in/-un").
- **D-04:** Do not translate English tech terms/flags or CLI configuration options.
- **D-05:** Translate markdown headers but preserve markdown anchor links format where possible, mapping to the localized slugs if required.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Standards
- `.planning/REQUIREMENTS.md` — Core constraints and rules
- `modes/tr/scan.md` — Reference for correct Turkish imperative tone and formatting from Phase 1
</canonical_refs>
