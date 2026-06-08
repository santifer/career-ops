# Card Schema (observed in the golden file)

This is the **actual** shape of objects inside `makeSamples()` in the golden Kanban HTML, as observed at `SEED_VERSION = v15-live-jobs`. Don't invent variants. If you see a different shape, surface it before changing anything.

## Card object

```javascript
{
  id: 'r17',                                    // 'r' + N for real jobs; sequential
  company: 'Samsara',
  role: 'Program Manager, Customer Support Enablement',
  platform: 'greenhouse',                        // greenhouse | lever | ashby | workday
  columnId: 'new-hot',                           // matches an existing column id
  url: 'https://boards.greenhouse.io/samsara/jobs/7587446',
  connectionName: '',                            // '' or a real LinkedIn first+last
  hasConnection: false,                          // mirrors connectionName presence
  connectionLinkedinUrl: '',                     // '' or full LI URL
  keywords: ['Program Management','PMP','Agile'],// up to 7, Title Case strings
  jobDescText: 'Two-to-three sentence summary…',
  createdAt: new Date(now - 1*h).toISOString(),
  lastRefreshed: new Date(now - 0.5*h).toISOString(),
  closedAt: null,                                // null while open; ISO string when closed
}
```

### Field rules

| Field | Rule |
|---|---|
| `id` | Sequential, follows existing pattern (`rN` is the current convention). Increment from the highest existing N. |
| `platform` | One of the four ATS values. Other values mean unknown ATS — don't make up new ones. |
| `columnId` | Must reference a column already declared in the kanban. `'new-hot'` is the seed default. |
| `url` | Full URL, must resolve. The splice script can verify with `--verify` (HEAD check). |
| `connectionName` ↔ `hasConnection` ↔ `connectionLinkedinUrl` | All three move together. Either all populated or all empty. |
| `keywords` | Array of 1–7 Title Case strings. Use the file's existing `extractKeywords()` helper if generating from a JD. |
| `jobDescText` | Two-to-three sentences, plain text. No newlines. |
| `createdAt` / `lastRefreshed` | Generated as ISO strings from `new Date(now - N*h).toISOString()`. The `now` and `h` consts are defined at the top of `makeSamples()`. |
| `closedAt` | `null` for open postings. When you mark a card closed, set this to an ISO string. |

## Comment block above each card

The file uses a triple-line comment marker. Match the existing anchor style — currently `REAL JOB`:

```javascript
    // ── REAL JOB 17 ─────────────────────────────────────────────
    // Samsara · Program Manager, Customer Support Enablement · greenhouse
    // Verified live April 2026: https://boards.greenhouse.io/samsara/jobs/7587446
```

The number after `REAL JOB` matches the card's id number. The middle line uses `Company · Role · Platform`. The third line is `Verified live <month> <year>: <url>`. The em-dashes after the anchor (`────…`) are 41 characters — match the existing file rather than hand-counting.

## `LINKEDIN_CONNECTIONS` array shape

The file holds connections inline as an array of compact objects:

```javascript
const LINKEDIN_CONNECTIONS = [
  {n:'Naomi Izedonmwen',c:'Accenture',p:'Senior Manager',u:'https://www.linkedin.com/in/naomiizedonmwen'},
  {n:'Zeeshaan Ramani',c:'Ally',p:'Manager - Sales Analytics',u:'https://www.linkedin.com/in/zeeshaan-ramani'},
  // …
];
```

Keys are the single letters `n`, `c`, `p`, `u` (name, company, position, url). **Do not switch to long-form keys** — the rest of the file expects this shape. The `update-connections.mjs` script writes in this exact format.

Right after the array, the file declares:

```javascript
const LINKEDIN_CONNECTIONS_COUNT = LINKEDIN_CONNECTIONS.length;
```

This is a runtime read, so the count is always in sync — but the validator still checks the array parses cleanly.

## `SEED_VERSION` rule

```javascript
const SEED_VERSION      = 'v15-live-jobs'; // bump this to force a re-seed on next load
```

- Format must match `/^v\d+-live-jobs$/`.
- Bump on every content change (cards, connections, column copy, freshness logic). Otherwise the browser's cached state wins and the user sees stale data.
- Increment by 1 each time. Don't skip numbers.
- The splice and update-connections scripts auto-bump. Manual edits to the file should bump too.

## `makeSamples()` shape

All cards live inside one factory function:

```javascript
function makeSamples() {
  const now = Date.now();
  const h   = 3600000;
  return [
    // ── REAL JOB 1 ─────────…
    { id:'r1', … },
    // ── REAL JOB 2 ─────────…
    { id:'r2', … },
    // …
  ];
}
```

The function returns an array literal. The `now` and `h` consts at the top are referenced by every card's `createdAt`/`lastRefreshed`. Don't move card objects outside the factory — they need that scope.

## Existing helpers in the file

| Helper | What it does |
|---|---|
| `extractKeywords(text)` | Tokenizes a JD blob and returns up to 7 Title Case keywords. Use this when ingesting a fresh job description. |
| `SKILL_TERMS` | A `Set` of expected skill terms used by `extractKeywords`. Don't shadow it — extend it carefully if you really need to. |

## When to break this schema

Never silently. If a real-world need appears (e.g., adding `salaryRange`), do this in order:
1. Surface the proposal to the user.
2. Update this reference file first.
3. Update `splice-cards.mjs` to accept and emit the new field.
4. Update the validator.
5. Then patch the kanban.

That order is the difference between "evolved schema" and "drifted schema".
