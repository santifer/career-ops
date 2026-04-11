# Customization Guide

## Profile (config/profile.yml)

This is the single source of truth for your identity. All modes read from here.

Key sections:
- **candidate**: Name, email, phone, location, LinkedIn, portfolio
- **target_roles**: Your North Star roles and archetypes
- **narrative**: Your headline, exit story, superpowers, proof points
- **compensation**: Target range, minimum, currency
- **location**: Country, timezone, visa status, on-site availability

## Target Roles (modes/_shared.md)

The archetype table in `_shared.md` determines how offers are scored and CVs are framed. Edit the table to match YOUR career targets:

```markdown
| Archetype | Thematic axes | What they buy |
|-----------|---------------|---------------|
| **Your Role 1** | key skills | what they need |
| **Your Role 2** | key skills | what they need |
```

Also update the "Adaptive Framing" table to map YOUR specific projects to each archetype.

## Portals (portals.yml)

Copy from `templates/portals.example.yml` and customize:

1. **freshness**: How aggressively to filter stale postings (see below)
2. **title_filter.positive**: Keywords matching your target roles
3. **title_filter.negative**: Tech stacks or domains to exclude
4. **search_queries**: WebSearch queries for job boards (Ashby, Greenhouse, Lever)
5. **tracked_companies**: Companies to check directly

### Tuning freshness

```yaml
freshness:
  max_age_days: 60        # Hard skip — postings older than this aren't evaluated
  warn_age_days: 30       # Evaluate but apply automatic Red Flags penalty
  linkedin_suspect: true  # Treat LinkedIn search-cache results as unverified
  require_date: false     # If true, missing posting date = uncertain (strict mode)
```

**When to lower `max_age_days`:**
- Hot/competitive markets (AI, FAANG, top startups) where postings turn over weekly
- High-volume scans where you'd rather miss a few than waste eval tokens on ghosts

**When to raise `max_age_days`:**
- Niche specialist roles (audio C++, hardware, scientific computing) that legitimately stay open for months
- Smaller companies that don't aggressively churn job boards

**Strict mode (`require_date: true`):** Skips any posting where no `datePosted` can be extracted. Recommended only if you're seeing false positives from sites that don't expose structured dates (e.g., custom careers pages).

See `docs/ARCHITECTURE.md` → "Freshness Filtering" for the full detection pipeline.

## CV Template (templates/cv-template.html)

The HTML template uses these design tokens:
- **Fonts**: Space Grotesk (headings) + DM Sans (body) -- self-hosted in `fonts/`
- **Colors**: Cyan primary (`hsl(187,74%,32%)`) + Purple accent (`hsl(270,70%,45%)`)
- **Layout**: Single-column, ATS-optimized

To customize fonts/colors, edit the CSS in the template. Update font files in `fonts/` if switching fonts.

## Negotiation Scripts (modes/_shared.md)

The negotiation section provides frameworks for salary discussions. Replace the example scripts with your own:
- Target ranges
- Geographic arbitrage strategy
- Pushback responses

## Hooks (Optional)

Career-ops can integrate with external systems via Claude Code hooks. Example hooks:

```json
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{
        "type": "command",
        "command": "echo 'Career-ops session started'"
      }]
    }]
  }
}
```

Save hooks in `.claude/settings.json`.

## States (templates/states.yml)

The canonical states rarely need changing. If you add new states, update:
1. `templates/states.yml`
2. `normalize-statuses.mjs` (alias mappings)
3. `modes/_shared.md` (any references)
