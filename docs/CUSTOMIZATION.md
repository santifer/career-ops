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

1. **title_filter.positive**: Keywords matching your target roles
2. **title_filter.negative**: Tech stacks or domains to exclude
3. **search_queries**: WebSearch queries for job boards (Ashby, Greenhouse, Lever)
4. **tracked_companies**: Companies to check directly

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

## Profile Tracks (config/profile.yml)

Tracks let you foreground different slices of your experience depending on the role type. Define them under `tracks:` in `profile.yml`:

- **builder**: Foregrounds IC/technical work — agent systems, shipping, prototyping
- **leadership**: Foregrounds team leadership, strategy, cross-functional work

Claude auto-infers the track from the JD. You can also force it:
- `--track builder` anywhere in your message
- `[track:leadership]` anywhere in your message
- Natural language: "use the leadership track"

## Personas (config/profile.yml)

Personas let you switch the contact block (phone, location, work authorization) for applications in different countries. Define them under `personas:` in `profile.yml`.

Claude auto-selects if only one persona is defined. If multiple are defined and none is specified, Claude will ask before generating the PDF.

Force a persona:
- `--persona uk` anywhere in your message
- `[persona:us]` anywhere in your message
- Natural language: "use my UK contact details"

## Bullet Tagging (cv.md) — Optional

Add inline tags to bullets in `cv.md` to improve track-based filtering:

```markdown
- Built multi-agent orchestration system handling 50K daily transactions. <!-- tags: built, agent, llm -->
- Managed team of 8 engineers across 3 time zones. <!-- tags: led, managed, team -->
- Defined AI roadmap with CPO and CTO, aligned 4 product squads. <!-- tags: strategy, stakeholder, aligned -->
```

Tags are optional. Without them, Claude uses the track's `evidence_tags` as weighted ranking signals — all bullets are still considered, just reordered.
