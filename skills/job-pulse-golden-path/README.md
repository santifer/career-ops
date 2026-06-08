# job-pulse-golden-path

The anti-fork skill for Rahil's Job Pulse Kanban (Pulse Engine 3.0).

## What it does

Forces every Cowork chat that touches "the kanban" to land on **one** canonical file:

```
C:\Users\rahil\AppData\Local\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\local-agent-mode-sessions\2622c7c0-f3b3-4deb-9739-ef9e53939676\32cc5b5e-9c8c-46cb-8d2f-7a6ba0d58861\local_76be79d0-28f8-4807-a360-0215a9d77d5f\outputs\job-pulse-kanban.html
```

No new boards. No parallel outputs folders. No `kanban-v2.html` clones. Schema-aware patching, automatic backups, atomic writes, governance + security baked in.

## Repo layout

```
job-pulse-golden-path/
├── SKILL.md                          ← the prompt Claude reads when triggered
├── README.md                         ← this file (humans only)
├── package-skill.ps1                 ← Windows packager (Compress-Archive)
├── package-skill.mjs                 ← Node packager (cross-platform fallback)
├── assets/
│   └── golden-path.txt               ← single source of truth for the file path
├── scripts/
│   ├── golden-path.mjs               ← prints the canonical path
│   ├── inspect-kanban.mjs            ← read SEED_VERSION, card count, schema
│   ├── splice-cards.mjs              ← anchor-aware card insertion + version bump
│   ├── update-connections.mjs        ← in-file LINKEDIN_CONNECTIONS edits
│   └── validate-kanban.mjs           ← HTML + JS + schema sanity checks
└── references/
    ├── card-schema.md                ← real card shape observed in the file
    ├── golden-path-policy.md         ← anti-fork laws
    ├── governance-and-security.md    ← PII/threat model
    └── dup-fix-anthropic-tpm.md      ← worked example: fix-plan from first scan
```

## Package and install

### Option A — Windows PowerShell (preferred)

```powershell
cd C:\Users\rahil\career-ops\skills\job-pulse-golden-path
.\package-skill.ps1
```

Output: `C:\Users\rahil\career-ops\output\job-pulse-golden-path.skill`

Drag that `.skill` file into any Cowork chat to install.

### Option B — Node (any OS)

```bash
node C:\Users\rahil\career-ops\skills\job-pulse-golden-path\package-skill.mjs
```

Same output path. Use this if PowerShell is unavailable or `Compress-Archive` misbehaves.

## Test it locally before installing

The included scripts work directly without packaging:

```powershell
# Read the file's current state
node C:\Users\rahil\career-ops\skills\job-pulse-golden-path\scripts\inspect-kanban.mjs

# Validate it's healthy
node C:\Users\rahil\career-ops\skills\job-pulse-golden-path\scripts\validate-kanban.mjs

# Get the canonical path (handy when typing `cd` somewhere)
node C:\Users\rahil\career-ops\skills\job-pulse-golden-path\scripts\golden-path.mjs
```

These point at the path in `assets/golden-path.txt` by default.

## What it caught on first run (2026-04-29)

Running `inspect-kanban.mjs` + `validate-kanban.mjs` against the live golden file revealed:

- Current `SEED_VERSION = v15-live-jobs`
- 33 card blocks total — but **12 use `REAL JOB` anchors and 12 use `LIVE JOB CARD` anchors**, meaning a prior session injected cards in the wrong schema (the exact problem this skill prevents going forward)
- 1,709 inline LinkedIn connections
- **One real duplicate**: Anthropic TPM Consumer Engineering exists as both `r1` (clean) and `live-5` (drifted clone)

Fix plan for the duplicate is in `references/dup-fix-anthropic-tpm.md`.

## Triggering

The skill description is intentionally pushy. It triggers on any of:

- "job pulse", "kanban", "the board", "pulse engine"
- `vN-live-jobs` SEED_VERSION mentions
- "REAL JOB cards"
- Refresh / add / debug / audit / translate the kanban
- A request to "make a new job board" (the skill **refuses the fork** and redirects)

The pushy description is by design — Claude tends to undertrigger custom skills, and the cost of triggering this skill on a borderline request is low (it's just instructions about the file). The cost of *not* triggering is a forked clone.

## Editing the path

If the canonical kanban moves, edit one file:

```
assets/golden-path.txt
```

Every script reads from there. No code changes needed.
