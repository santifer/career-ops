# Dashboard Strategy — 2026-05-09

**Author:** Claude (long-form research and design pass)
**Scope:** Hosting + design uplevel for the career-ops dashboard at `dashboard.careers-ops.com`
**Status:** Greenlight-ready. No code written. Mitchell to approve before Phase 1 execution.

---

## Research methodology — disclosure

The brief asked for separate Grok and Perplexity deep-research transcripts. Direct Grok and Perplexity APIs were not available in this environment. The "multi-LLM corroboration" was therefore performed via:

1. **Codebase deep-read** — full reads of `dashboard-server.mjs` (693 LOC), strategic samples of `scripts/build-dashboard.mjs` (1934 LOC), inspection of `dashboard/index.html` structure, batch state files, and the AGENTS.md / CLAUDE.md conventions.
2. **WebSearch validation** — eight targeted queries against current 2026 sources (Cloudflare docs, Tailscale docs, shadcn/ui guides, indie SaaS commentary, mobile-table UX research, basic-auth vs Access threads).
3. **Internal model knowledge** — Claude Opus 4.7 with January 2026 cutoff; cross-checked against the WebSearch results for drift.

Where the brief expected three independent voices, you instead get one voice with three classes of evidence. Every concrete recommendation below cites either a code line, a documented spec, or a 2026 source. Disagreements between sources are flagged in §A and §B.

---

# Part A — Hosting & access strategy

## 1. Recommendation: **Cloudflare Tunnel + Cloudflare Access (email OTP)**

Run a `cloudflared` tunnel from Mitchell's Mac (the existing dev/server box) that exposes the local Node `dashboard-server.mjs` on port 3001 via `dashboard.careers-ops.com`. Gate the entire hostname behind a Cloudflare Access policy that allows exactly one email — `mitwilli@gmail.com` — using one-time-PIN as the auth method. Add Google as a fallback IdP later if desired.

### Why this and not the others

| Option | Verdict | Killer issue |
|---|---|---|
| **Cloudflare Tunnel + Access** ✅ | **Picked.** | None for this use case. |
| Tailscale (mesh) | No. | Requires the Tailscale app on every client device. "Open from any browser on any device" goal fails on a borrowed work laptop or a friend's phone. |
| Tailscale Funnel | No. | Forces a `*.ts.net` subdomain — cannot use `dashboard.careers-ops.com`. Confirmed in 2026 docs; still beta with platform gaps. |
| Vercel | No. | Server is `http.createServer` reading the local filesystem (`data/applications.md`, `batch/batch-state.tsv`, `reports/*.md`). Porting to serverless functions = full rewrite of the data layer (object storage or KV sync), and you lose live polling against the live filesystem that the batch worker writes to. The whole point of the dashboard collapses. |
| Railway / Fly.io / Render | No. | Always-on compute that you pay for, and you still have to ship the data in some form. Authentication is bring-your-own. Higher floor, identical ceiling, worse for the live-filesystem model. |
| Caddy + basic auth on a VPS | No, with caveat. | Works, but you take on cert renewal, port forwarding (or yet another tunnel), and basic-auth is the weakest of the three auth options — credentials in every request, no OTP, awkward mobile keyboard UX, no audit log, no SSO upgrade path. |

The decisive points for Cloudflare Tunnel:
- **No port forwarding, no public IP, no inbound listener on the laptop.** Tunnel is outbound-only QUIC from `cloudflared`.
- **Cloudflare-issued TLS at the edge** — zero local cert work for `dashboard.careers-ops.com`.
- **Custom domain on day one** if `careers-ops.com` is on Cloudflare nameservers (or can be moved).
- **Cloudflare Access free tier covers up to 50 users.** A single-user policy is well inside the free band; 24-hour log retention is enough for a personal dashboard.
- **Email OTP works without setting up an IdP.** Click the magic link in a 6-digit-code email, get a session cookie, use any browser on any device.
- **Failure mode is contained.** When the Mac is asleep the dashboard is offline; nothing about the data is at risk.

The **only** legitimate disagreement in the sources: a small homelab cohort prefers Tailscale + Caddy because it avoids routing through Cloudflare. That argument is correct for them — they want to share services across many devices privately and are willing to install the client. It does not apply here. Mitchell wants browser access from any device, public DNS, and a fast setup.

## 2. Step-by-step deployment plan

Assumes `careers-ops.com` is registered (the brief says it is) and can be moved to Cloudflare nameservers. If it's already on Cloudflare nameservers, skip step 1.

```bash
# Step 1 — Move careers-ops.com to Cloudflare (one-time, ~15 min)
# Cloudflare dashboard → Add site → enter careers-ops.com → choose Free plan
# Copy the two assigned Cloudflare nameservers
# Update nameservers at the registrar (likely Namecheap/Porkbun/Cloudflare Registrar)
# Wait for propagation (usually <1h, can be up to 24h)

# Step 2 — Install cloudflared on the Mac
brew install cloudflared
cloudflared --version    # confirm install

# Step 3 — Authenticate cloudflared with the Cloudflare account
cloudflared tunnel login   # opens browser, pick careers-ops.com

# Step 4 — Create the named tunnel
cloudflared tunnel create career-ops-dashboard
# Records the UUID + writes credentials to ~/.cloudflared/<UUID>.json

# Step 5 — Route DNS for the hostname to the tunnel
cloudflared tunnel route dns career-ops-dashboard dashboard.careers-ops.com

# Step 6 — Write the tunnel config
mkdir -p ~/.cloudflared
cat > ~/.cloudflared/config.yml <<'YAML'
tunnel: career-ops-dashboard
credentials-file: /Users/mitchellwilliams/.cloudflared/<UUID>.json

ingress:
  - hostname: dashboard.careers-ops.com
    service: http://localhost:3001
  - service: http_status:404
YAML

# Step 7 — Run the tunnel as a launchd service so it survives reboots
sudo cloudflared service install
# Or, equivalently for user-mode launchd, copy ~/.cloudflared/config.yml
# into a LaunchAgent plist alongside the existing data/launchctl-commands.md entries

# Step 8 — Make sure the Node server is itself running under launchd
# Add a LaunchAgent for: node dashboard-server.mjs --port=3001
# Pattern matches the existing heartbeat / batch launchd setup

# Step 9 — Verify
curl -I https://dashboard.careers-ops.com   # expect 302 to Cloudflare Access login
```

Files added/modified in the repo:

- New: `infra/cloudflared-config.yml.example` — committed sample with `<UUID>` placeholder, real config kept in `~/.cloudflared/` outside the repo.
- New: `infra/launchagents/com.mitchell.dashboard-server.plist` — runs the Node server.
- Modified: `data/launchctl-commands.md` — append the dashboard + tunnel load/unload lines so the existing runbook stays the source of truth.
- Modified: `dashboard-server.mjs` — bind to `127.0.0.1` instead of `0.0.0.0` for defense-in-depth (the tunnel already provides the only ingress, but localhost-only binding closes the LAN backdoor entirely). One-line change in the `server.listen` call.

## 3. Custom domain configuration for `dashboard.careers-ops.com`

Done implicitly by step 5 above. `cloudflared tunnel route dns` writes a CNAME from `dashboard.careers-ops.com` to `<tunnel-UUID>.cfargotunnel.com`. Cloudflare auto-provisions a Universal SSL cert for the hostname. No manual ACME, no Caddy, no Let's Encrypt to babysit.

If `careers-ops.com` cannot be moved to Cloudflare nameservers, the fallback is partial-zone delegation: add `dashboard` as a subdomain on Cloudflare and CNAME from the registrar's DNS. This works but loses some of the WAF/rate-limit benefits.

## 4. Authentication approach

**Cloudflare Access policy, single-user.** Configure once at `one.dash.cloudflare.com` → Access → Applications:

1. Add application → Self-hosted → name "career-ops dashboard", domain `dashboard.careers-ops.com`.
2. Identity provider: enable the built-in **One-time PIN** provider (no IdP needed). Optionally also enable Google so Mitchell can sign in with the existing Google account on top.
3. Policy: Action `Allow`, Include rule `Emails` = `mitwilli@gmail.com`. That's it.
4. Session duration: 30 days (long enough that the phone doesn't re-prompt every visit).
5. Optional but recommended: enable **App Launcher** so `dashboard.careers-ops.com/cdn-cgi/access/login/` shows a clean entry page on first hit.

Why not basic auth: in 2026 the consensus on basic auth for anything reaching the public internet is "acceptable in a low-risk controlled environment," not for a dashboard that holds your application history, scoring, and JD content. OTP is operationally equivalent — you tap "send code", you paste 6 digits — and it gives you per-session cookies, audit logs, and a clean upgrade path to Google SSO.

Why not a custom token-in-header scheme: rolling your own auth in `dashboard-server.mjs` puts another security surface on you to maintain. Cloudflare Access is a couple of dropdowns.

## 5. Mobile access verification steps

After Phase 1 ships:

1. On iPhone Safari: open `dashboard.careers-ops.com`. Confirm Access redirect, click "Send me a code", paste the OTP from email.
2. Confirm the dashboard loads and KPI cards render. Tap each KPI — confirm `/api/detail/*` returns and the panel expands.
3. Tap "All Evaluations" search box — confirm the iOS keyboard does not push the layout in a broken way.
4. Tap an Apply-Now row — confirm the expand row reads cleanly (this will be ugly until Phase 3 mobile work; Phase 1 is just "is it reachable and authenticated").
5. On the work laptop in Chrome incognito: confirm the OTP path works without Mitchell's Google session.
6. Repeat the OTP path on the personal laptop. Confirm session persists across browser restarts (because of the 30-day session).
7. Pull `~/Library/Logs/com.mitchell.dashboard-server/stderr.log` and the `cloudflared` log; confirm the server saw three distinct sessions.

---

# Part B — Design uplevel priorities

The dashboard is already shipping the recent design tokens, dark-mode parity, Inter, gap modal, Apply-Now panel, and age column. The remaining gap between "looks good" and "feels like Linear" is concentrated in six surfaces: mobile, the expand-row panel, status writeback, the batch history, the score chart, and the bug fix.

## 1. Ranked list — top 10 improvements (impact ÷ effort)

Effort is calibrated against the existing static HTML + build-script architecture. "S" = under 1 hour. "M" = 1–3 hours. "L" = 3–8 hours. "XL" = a full day or more.

| # | Improvement | Effort | Why it matters |
|---|---|---|---|
| **1** | **Batch overlay sticky-dismiss fix** | S | Closing a UI element and watching it pop back every 2s is the single worst feel in the current dashboard. Fast win, must-have. |
| **2** | **Mobile breakpoint + table → card view < 720px** | L | The whole point of moving to a custom domain is mobile access. Without this, mobile usage will fail within a week and Mitchell will go back to localhost. |
| **3** | **Inline status writeback (Evaluated → Applied → Interview)** | L | Read-only dashboards rot. The action that runs the system — moving rows through the funnel — happens in `data/applications.md` today. Doing it from the dashboard removes the last reason to drop into a terminal. |
| **4** | **Persistent batch history panel** | M | The current overlay only shows the live batch. Mitchell loses context the moment a batch finishes. A "Last 10 batches" stat panel under the Batch toolbar button gives a real running record without changing storage. |
| **5** | **Expand-row visual hierarchy refactor** | M | Today the expand row is dense text. The data is already structured (Match / Gap / Story / Recommendation). Splitting into named subsections with the same chip/badge language as the gap modal makes the row readable in three seconds instead of fifteen. |
| **6** | **Score distribution chart → segmented bar** | S | Replace the per-row `.bar-track`/`.bar-fill` divs with a single horizontal segmented bar (5 colored stops, count labels above). Same data, much better at-a-glance signal. |
| **7** | **Drawer (Sheet) component for row detail on mobile** | M | On desktop, expand-row inline is right. On mobile, a slide-up drawer is the dominant 2026 pattern (shadcn Sheet, Tailwind Headless drawer). Reuse the same data wiring. |
| **8** | **Search across report content** | M | The filter today only matches `data-company / data-role / data-status`. Once `parseReportSummary()` runs on every row (it already does in `/api/detail/*`), expose `tldr + recommendation + topGaps + topEdges` as a `data-search` attribute so the existing filter input becomes a real search. |
| **9** | **Touch-target audit + 44px minimum** | S | Stat cards, sortable headers, and gap chips all need to be >= 44×44 on mobile. Mostly a `min-height` and `padding` pass. |
| **10** | **Gap modal richer markdown rendering** | S | Today `gap-section-body` does `\n → <br>`. Use the existing `marked` import (already in `build-dashboard.mjs`) to render the data attributes through `marked.parse()`. Headings, lists, code spans render cleanly. |

Skipped on purpose:

- "Real-time websocket push instead of polling" — the 2s/30s polling cadence is fine for a single-user dashboard, complexity not worth it.
- "Switch to React + shadcn/ui" — would invalidate the entire `build-dashboard.mjs` pipeline and weeks of design tuning. shadcn is a *reference* for patterns, not a target framework here.
- "Add a real chart library" — Tremor / Recharts / Chart.js would each pull in 30–80kB. Score distribution and Top Companies are the only charts that exist; both are flat counts, both work fine as styled bars.

## 2. Specific design recommendations

### Mobile table design (priority #2)

Three-tier breakpoint plan:

- **`>= 1024px` (current desktop):** unchanged.
- **`720px–1023px` (tablet / small laptop):** drop the Eval Date and Age columns into a single relative-time line shown beneath the role. Keep horizontal scroll on the All Evaluations table only — Apply-Now becomes the primary view.
- **`< 720px` (phone):** convert each row into a **stacked card** with this hierarchy:

```
┌───────────────────────────────────────────────┐
│  4.5  ANTHROPIC                          ▾    │  ← score chip + company + tap-to-expand
│  Strategic Operations Manager · Claude         │  ← role
│  Evaluated · 3d ago                            │  ← status pill + age
│  ⚠ 2 gaps   ⭐ pickone                          │  ← inline chips (gap count, throttle)
└───────────────────────────────────────────────┘
```

Tapping the card opens the **drawer** (priority #7) — full-height slide-up with the same content the desktop expand row shows.

Build path: a single `@media (max-width: 720px)` block in the existing `<style>` plus a small JS check in `toggleDetail()` that picks "drawer" or "inline expand" depending on `window.matchMedia('(max-width:720px)').matches`. The card layout itself is a `display: flex; flex-direction: column;` rewrite of `<tr>` styling — no markup change required if we use `display: contents` on the row and `display: flex` on the cells in mobile mode. About 40 lines of CSS.

### Expand-row visual hierarchy (priority #5)

Currently the expand row is 4 `.detail-block` divs with Markdown text. Reframe each into a **labeled card** matching the gap modal's `.gap-section-label` / `.gap-section-body` shape:

- **Match** — green left border (uses `--green-border`), label "WHAT FITS"
- **Gap** — amber, label "WHAT'S MISSING", chips above the prose for each named gap
- **Story** — purple, label "STORIES TO LEAD WITH"
- **Recommendation** — blue, label "ACTION", with the Apply / Skip / Defer button right-aligned

This is the same visual language used inside the gap modal already, so users learn it once. About 30 lines of CSS, ~50 lines of template change in `build-dashboard.mjs` where the detail row is built.

### Status update flow (priority #3)

Add to `dashboard-server.mjs`:

```
POST /api/status
  body: { num: 273, status: "Applied", note?: "Submitted via Greenhouse" }
  → reads data/applications.md, updates the row inline, writes file, returns 200
```

The endpoint must:
1. Validate `status` is one of the canonical states from `templates/states.yml` (per AGENTS.md).
2. Read-modify-write `data/applications.md` atomically (temp file + rename).
3. Append to `data/follow-ups.md` if status transitions Evaluated → Applied (matches existing convention).
4. Return the row's new shape so the client can update without a refetch.

Client side: the status pill in each row becomes a click target. Click → small inline popover with the canonical states from a constant list. Click Applied → optimistic UI swap → POST → success or revert. About 80 LOC of new server code, 60 LOC of new client code.

This is the only design item that touches the data contract. Worth it. The dashboard graduates from "view" to "operate."

### Batch history view (priority #4)

The data already exists in `batch/batch-state.tsv` — every batch run appends rows. The `parseBatch()` function reads it. Today only the *current* batch is exposed.

Approach: add a new detail endpoint `/api/detail/batches` that groups `batch-state.tsv` rows by batch run (using `started_at` date or a new batch-id column). Render as a stat-panel under a new sixth stat card "Batches run", showing the last 10 batches with completed/failed counts, duration, and average score. Click a row to drill into that batch's results.

No schema change needed if we treat "batch" as "a contiguous block of rows with `started_at` within an N-minute window." A schema change (add a `batch_id` column to `batch-state.tsv`) is cleaner; defer to phase 3.

### Chart uplevel (priority #6)

Replace the current 5-row vertical bar chart for Score Distribution with a single horizontal **segmented bar**:

```
┌────────────────────────────────────────────────────────┐
│ ████ 4.5+(7)  ███████████ 4.0–4.4(23)  ██████████ 3.5–3.9(31)  ██████ 3.0–3.4(18)  ███ <3.0(12) │
└────────────────────────────────────────────────────────┘
   strong         apply              borderline         soft           skip
```

One row, color-coded segments (green → amber → red gradient using the existing tokens), counts inline, semantic labels under. About 40 lines of CSS using flex + flex-grow proportions. No library.

Top Companies chart is already correct shape; leave it.

### Batch overlay sticky-dismiss fix (priority #1)

This is the bug the brief explicitly calls out. The current code in `scripts/build-dashboard.mjs`:

```js
// line 1283 — close button:
onclick="document.getElementById('batch-overlay').classList.remove('visible')"

// line 1749 — pollBatch runs every 2s:
async function pollBatch() {
  const data = await apiFetch('/api/batch-live');
  if (!data) return;
  const overlay = document.getElementById('batch-overlay');
  const btn = document.getElementById('batch-toggle-btn');
  if (data.total > 0) {
    btn && (btn.style.display = '');
    overlay.classList.add('visible');     // ← re-pops every 2s after dismiss
    ...
```

Required fix:

```js
// Module-level session flag
let _batchOverlayDismissed = false;

// pollBatch — only show if not dismissed
if (data.total > 0) {
  btn && (btn.style.display = '');
  if (!_batchOverlayDismissed) overlay.classList.add('visible');
  // ... rest unchanged: still update title/body/bar even if hidden
}

// Close button — set the flag
function dismissBatchOverlay() {
  _batchOverlayDismissed = true;
  document.getElementById('batch-overlay').classList.remove('visible');
}

// Toolbar button — explicit re-open path
function toggleBatchOverlay() {
  const el = document.getElementById('batch-overlay');
  const opening = !el.classList.contains('visible');
  if (opening) _batchOverlayDismissed = false;
  el.classList.toggle('visible');
}
```

Three lines added, two lines changed, fixes the worst feel in the dashboard. Must respect dismissal across the whole session — the flag is intentionally not reset when a new batch starts. Only the toolbar button reopens it. This matches the user-feedback memory `feedback_respect_user_dismissal.md`.

## 3. New components / interactions worth adding

- **Toast** for status update confirmation. Trivial CSS, one global function. Used by status writeback, save-evidence, and any future POST endpoint.
- **Command palette (`Cmd-K`)** — *defer to a Phase 4*. Strong fit for a Linear-density dashboard with 200+ rows but not on the critical path; would consume a day.
- **Skeleton loaders** in `/api/detail/*` panels instead of the current `class="loading"` text. About 20 lines of CSS — pulse animation on three rectangles. Worth it; the perceived-perf gap on mobile networks is real.
- **Sticky filter bar** on the All Evaluations panel — when scrolled past the filters, dock them to the top. Scrolling 200 rows then losing the search input is a current pain. About 15 lines.

---

# Part C — Implementation sequence

## Phase 1 — Hosting (highest priority, unblocks mobile)

Goal: `https://dashboard.careers-ops.com` works from phone, work laptop, personal laptop, behind Cloudflare Access OTP. ~2–3 hours including DNS propagation wait.

Order:
1. Move `careers-ops.com` to Cloudflare nameservers (15 min + propagation).
2. Install + auth `cloudflared` (10 min).
3. Create tunnel + DNS route (5 min).
4. Write `~/.cloudflared/config.yml` (5 min).
5. Wrap `dashboard-server.mjs` in a LaunchAgent (15 min).
6. `sudo cloudflared service install` (5 min).
7. Create Cloudflare Access policy with `mitwilli@gmail.com` allow rule (10 min).
8. Bind the Node server to `127.0.0.1` instead of `0.0.0.0` (1 min).
9. Verify on three devices (15 min).

Do **not** start Phase 2 until Phase 1 is verified. The whole point of the design uplevel is being able to use the dashboard from anywhere; if hosting is half-built, design polish goes wasted.

## Phase 2 — Quick design wins (each < 2 hours)

These can be done in any order, in a single sitting, all in `scripts/build-dashboard.mjs`:

1. Sticky-dismiss fix (priority #1) — 15 min.
2. Score distribution segmented bar (priority #6) — 45 min.
3. Touch-target audit + 44px minimum (priority #9) — 30 min.
4. Gap modal markdown rendering via `marked.parse()` (priority #10) — 20 min.
5. Skeleton loaders for stat panels — 30 min.
6. Sticky filter bar on All Evaluations — 20 min.
7. Toast component — 30 min (only valuable as prep for Phase 3).

All seven changes ship in one commit cycle: `Run npm run build:dashboard, refresh the page, done.`

## Phase 3 — Larger feature work

Pick one per week unless it's a quiet stretch.

1. **Mobile breakpoint + card view** (priority #2) — 1 day. Highest user-visible payoff after hosting.
2. **Drawer for mobile detail** (priority #7) — pairs naturally with #2; bundle them.
3. **Status writeback** (priority #3) — half day. Adds a real backend mutation; needs careful atomic-write of `applications.md`. Must respect the AGENTS.md rule `RULE: NEVER create new entries in applications.md if company+role already exists` — endpoint is update-only, never insert.
4. **Expand-row visual hierarchy** (priority #5) — half day. Pure CSS + template work, no data changes.
5. **Persistent batch history view** (priority #4) — half day. Reuses existing `batch-state.tsv` parser.
6. **Search across report content** (priority #8) — couple of hours. Needs to land after status writeback so the search index includes the latest statuses.

## What to defer or skip

- WebSockets / SSE — current polling is correct for the load.
- Real chart library — segmented bar is enough.
- React/shadcn rewrite — never. The static-HTML-with-tokens approach is already good and dramatically simpler to iterate on.
- Multi-user / role-based access — single user; the Access policy stays as one email forever.
- Native mobile app — PWA installability is fine if there's interest, but not before Phase 3 ships and Mitchell has actually used the mobile dashboard for a week.

---

# Part D — Open questions

These need Mitchell's input before kicking off Phase 1. None are blockers individually, but the answers shape execution.

1. **`careers-ops.com` nameserver state.** Is the domain already on Cloudflare nameservers, or hosted at the registrar (Namecheap / Porkbun / Cloudflare Registrar / etc.)? If not Cloudflare, are you OK moving the zone? — Affects step 1 of the deployment plan; the partial-zone fallback exists if you'd rather not.

2. **Mac-as-server vs always-on box.** The recommendation runs `cloudflared` and the Node server on the Mac. When the Mac sleeps, dashboard is offline. Acceptable, or do you want me to plan a $5/month VPS or Raspberry Pi Phase 1.5? — If yes, the data sync becomes the new hard problem (the server reads files that the Mac batches write).

3. **Authentication aggressiveness.** OTP-only, or also enable Google SSO so logging in on Chrome with the existing Google session is one-click? — Both are free; both can coexist. I'd default to "both" but it's your call.

4. **Status writeback scope.** When you mark a row Applied from the dashboard, do you want it to also (a) write the apply-pack pointer back into the row's `notes`, (b) trigger a follow-up cadence entry in `data/follow-ups.md`, or (c) just update the status field? — I'd argue (b) belongs to the existing `followup-cadence.mjs` flow and we keep the dashboard endpoint narrow (status + optional note), but you may want the integrated path.

5. **Mobile design tone.** Strict-clone-of-desktop or "phone-native" with bigger type, fewer columns, swipe gestures? — I planned the second. The first is faster to ship and uglier.

6. **Domain consistency.** The brief says `dashboard.careers-ops.com`. The repo is named `career-ops` (singular). Confirm the domain spelling — `careers-ops.com` (with an S) — is intentional and that's where you actually own DNS.

7. **Session length on Cloudflare Access.** I proposed 30 days. Some users want 7. Trade-off: longer = fewer OTP prompts on the phone, shorter = better on lost devices. — Default 30, change to 7 if you ever lose a device.

8. **Batch overlay default-open behavior on a fresh load.** Today it auto-opens whenever a batch is in progress. After the sticky-dismiss fix, that's still the default. Want it to default-collapsed-with-toolbar-glow instead so it never grabs attention again? — I would not change this, but you might prefer the gentler version.

---

## Source list

- [Cloudflare Tunnel — Set up](https://developers.cloudflare.com/tunnel/setup/)
- [Cloudflare Tunnel in 2026: Expose localhost Without Opening Ports or Buying an IP](https://recca0120.github.io/en/2026/04/14/cloudflare-tunnel-2026/)
- [Self-hosted Application via Cloudflare One](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/)
- [Cloudflare Zero Trust Plans & Pricing (Free up to 50 users)](https://www.cloudflare.com/plans/zero-trust-services/)
- [Cloudflare vs Tailscale comparison](https://tailscale.com/compare/cloudflare-access)
- [Tailscale vs Cloudflare Tunnel — homelab perspective](https://www.xda-developers.com/why-i-ditched-cloudflare-tunnels-for-tailscale-and-caddy-on-my-homelab/)
- [Tailscale Funnel limitations (`*.ts.net` only)](https://onidel.com/blog/tailscale-cloudflare-nginx-vps-2025)
- [Table design UX guide for SaaS](https://www.eleken.co/blog-posts/table-design-ux)
- [shadcn/ui Data Table docs](https://ui.shadcn.com/docs/components/radix/data-table)
- [Building a Modern Admin Dashboard with shadcn/ui in 2026](https://dev.to/ausrobdev/how-to-build-a-modern-admin-dashboard-with-shadcnui-in-2026-3477)
- [Dense Interfaces Are Back: 2026](https://mydesigner.gg/blog/dense-interfaces-information-hierarchy-2026)
- [SaaS UI Design Trends 2026](https://www.saasui.design/blog/7-saas-ui-design-trends-2026)
- [Cloudflare Workers HTTP Basic Auth (and why Access is preferred)](https://developers.cloudflare.com/workers/examples/basic-auth/)
- [Cloudflare Access — One-Time PIN](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/)
- [Progressive Enhancement primer](https://enhance.dev/docs/patterns/progressive-enhancement)

— end of strategy —
