# Market Pack Contract

Issue: #1026

Market packs are first-class bundles for country or regional job-search behavior. They are not just translated modes. A market pack may combine local boards, compensation vocabulary, CV conventions, location aliases, legitimacy signals, and recruiter etiquette while leaving candidate personalization in the user layer.

## Directory Shape

```text
markets/<market-id>/
  README.md
  portals.example.yml
  compensation.yml
  location-aliases.yml
  cv-conventions.md
  legitimacy-signals.yml
```

`<market-id>` should use a stable BCP-47-style identifier such as `de-DE`, `fr-FR`, `pt-BR`, or `en-US`.

## Selection Order

Agents and future scripts should resolve market context in this order:

1. `config/profile.yml` explicit setting:

   ```yaml
   language:
     market_pack: de-DE
   ```

2. detected market from the JD, source domain, salary currency, location, or portal provider.
3. fallback to the current `language.modes_dir` or default modes.

The market pack controls market vocabulary and local conventions. It must not override user-specific goals, compensation floors, constraints, preferred tone, or personal evidence.

## File Schemas

### `portals.example.yml`

Purpose: market-specific public job-board and ATS defaults. Required top-level key: `portals`, an array of portal entries.

Each portal entry should include:

- `name` (string, required): display name.
- `url` (string, required): base URL or search URL.
- `type` (string, optional): `ats`, `job_board`, `company`, or `aggregator`.
- `enabled` (boolean, optional): default inclusion flag.
- `notes` (string, optional): market-specific caveats.

### `compensation.yml`

Purpose: salary vocabulary and normalization hints. Required top-level key: `terms`, an array.

Each term should include:

- `term` (string, required): local phrase.
- `normalized` (string, required): canonical career-ops meaning.
- `category` (string, optional): `base`, `bonus`, `equity`, `benefit`, `tax`, or `frequency`.
- `notes` (string, optional): interpretation guidance.

### `location-aliases.yml`

Purpose: normalize cities, regions, remote-work phrases, and cross-border location terms. Required top-level key: `aliases`, an array.

Each alias should include:

- `alias` (string, required): observed phrase.
- `canonical` (string, required): normalized location or work-mode bucket.
- `country` (string, optional): ISO country code or region name.
- `work_mode` (string, optional): `remote`, `hybrid`, `onsite`, or `unknown`.

### `cv-conventions.md`

Purpose: human-readable conventions for CV/resume expectations in the market.

It should cover expected length, photo usage, reverse chronology norms, language expectations, credential formatting, and common ATS concerns.

### `legitimacy-signals.yml`

Purpose: market-specific public signals for credible or risky postings. Required top-level keys: `positive_signals` and `risk_signals`, both arrays of strings or objects.

Object entries may include:

- `signal` (string, required): observed public fact.
- `severity` (string, optional): `low`, `medium`, or `high`.
- `notes` (string, optional): evaluation guidance.

## Separation From User Personalization

Market packs may contain:

- market-specific compensation terms and normalization hints
- public portal/job-board defaults
- location aliases and remote-work vocabulary
- CV/resume conventions for the market
- local legitimacy and scam signals
- application and follow-up etiquette

Market packs must not contain:

- user CV facts
- target companies
- personal compensation minimums
- immigration details
- private application decisions
- user narrative strategy

Those remain in `config/profile.yml`, `modes/_profile.md`, `article-digest.md`, and other user-layer files.

## Reference Mapping

The existing `modes/de/` directory maps naturally to a DACH-style market pack:

- `modes/de/angebot.md` -> localized evaluation mode
- `modes/de/bewerben.md` -> localized apply mode
- `modes/de/pipeline.md` -> localized pipeline mode
- `modes/de/_shared.md` -> shared German-language market vocabulary

`markets/de-DE/README.md` documents the first reference bundle without moving the existing modes.
