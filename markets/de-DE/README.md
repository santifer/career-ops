# Market Pack: de-DE

Issue: #1026

This reference pack maps the existing German modes into the market-pack contract without moving files.

## Existing Mode Mapping

| Market capability | Current source |
|---|---|
| localized evaluation mode | `modes/de/angebot.md` |
| localized apply mode | `modes/de/bewerben.md` |
| localized pipeline mode | `modes/de/pipeline.md` |
| shared German vocabulary | `modes/de/_shared.md` |

## Market Scope

This pack represents Germany-first DACH conventions for:

- salary language such as gross annual salary, 13th month pay, bonus, and tariff hints
- contract language such as permanent employment, fixed-term contracts, notice periods, and probation
- remote-work wording such as hybrid, on-site, remote within Germany, and EU-only remote
- CV conventions around concise reverse chronology, impact bullets, and market-relevant certifications
- legitimacy signals such as imprint/company identity, recruiter domain consistency, and realistic compensation ranges

## User-Layer Boundary

The pack does not store target salary, visa status, personal constraints, preferred sectors, or application history. Those remain in `config/profile.yml`, `modes/_profile.md`, tracker files, and reports.

## Example Profile Selection

```yaml
language:
  market_pack: de-DE
  modes_dir: modes/de
```

`market_pack` selects market conventions. `modes_dir` continues to select localized mode files until scripts grow first-class market-pack loading.

