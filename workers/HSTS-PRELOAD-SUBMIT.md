# D24 — HSTS Preload Submission Checklist

Submit `dashboard.careers-ops.com` to the browser HSTS preload lists.  
Once submitted and accepted, the domain is hardcoded as HTTPS-only in Chrome, Firefox, and Safari — no first-visit redirect needed.

**Do not submit until all conditions below are confirmed.**

---

## Phase 1 — Pre-submission requirements

### 1. Worker is serving the updated HSTS header

Verify the Worker is live and returning the correct header:

```bash
curl -sI https://dashboard.careers-ops.com/ | grep -i strict-transport-security
```

Expected:
```
strict-transport-security: max-age=63072000; includeSubDomains; preload
```

Requirements per hstspreload.org:
- `max-age` must be at least 31,536,000 (1 year). We use 63,072,000 (2 years).
- `includeSubDomains` must be present.
- `preload` must be present.

### 2. Worker has been serving this header for at least 1 week

Do not rush this. Browsers check the header's age during preload eligibility review. Run the worker for a minimum of 7 days with the `preload` directive before submitting.

### 3. ALL subdomains serve HTTPS

`includeSubDomains` means the preload list entry covers `*.careers-ops.com`.  
Every subdomain — staging, dev, api, any future ones — must already serve HTTPS only.

Check staging:
```bash
curl -sI https://staging-dashboard.careers-ops.com/ | grep -i strict-transport-security
```

If any subdomain still serves HTTP (even with a redirect), submitting now will break those users after the preload list ships. Fix HTTPS first.

### 4. CSP is in enforcement mode (not required by preload, but advisable)

By the time you submit HSTS preload, you should have completed the 7-day CSP report-only window and flipped to enforcement. See `DEPLOY-INSTRUCTIONS.md` Step 11.

---

## Phase 2 — Submit to hstspreload.org

### Step 1 — Open the submission form

Navigate to: **https://hstspreload.org/?domain=dashboard.careers-ops.com**

The site will run an automated check and display eligibility status.

### Step 2 — Confirm the four submission checkboxes

You must check all four boxes before the Submit button activates:

| # | Checkbox text | What it means |
|---|---------------|---------------|
| 1 | I understand that this domain and all its subdomains will be excluded from non-HTTPS connections | Commits you to HTTPS-only for all of `careers-ops.com` |
| 2 | I have read the preloading risk notice and I understand the risk | Preload list removal takes 6–12 weeks; you cannot quickly un-preload |
| 3 | I understand that once submitted, this domain will be put on the preload list in the next major browser releases | No take-backs on the fast path |
| 4 | I confirm that dashboard.careers-ops.com is my domain and that I am authorized to request preloading | Owner attestation |

### Step 3 — Click "Submit to preload list"

That's the entire submission. You'll receive a confirmation on the page.  
No email confirmation is sent.

---

## Phase 3 — Post-submission tracking

### Timeline (approximate)

| Milestone | Timeframe |
|-----------|-----------|
| Domain appears in Chromium preload source | 2–4 weeks after submission |
| Chrome stable ships the list update | 4–8 weeks after Chromium merge |
| Firefox includes the domain | 6–10 weeks after submission |
| Safari includes the domain | 8–12 weeks after submission |

Track status at any time:
```
https://hstspreload.org/?domain=dashboard.careers-ops.com
```

Status will change from "pending" → "preloaded".

### Verify in Chrome DevTools (after preload ships)

1. Open Chrome (must be a version that shipped the list containing your domain).
2. Open DevTools → Network → select any request to `dashboard.careers-ops.com`.
3. In the response headers, look for: `strict-transport-security: ... preload`
4. In Security tab: "HSTS: This page is HSTS preloaded."

---

## Removal (if ever needed)

Preload removal is intentionally slow and difficult:

1. Navigate to: **https://hstspreload.org/removal/**
2. Submit the removal request.
3. Remove `preload` from your HSTS header (change `max-age` to at least 1 year but drop `preload`).
4. Wait 6–12 weeks for the removal to propagate through browser updates.

**This is why pre-submission checks matter.** Committing to preload is a long-term infrastructure decision.

---

## Quick reference

| Action | URL |
|--------|-----|
| Check eligibility & submit | https://hstspreload.org/?domain=dashboard.careers-ops.com |
| Check submission status | https://hstspreload.org/?domain=dashboard.careers-ops.com |
| Request removal | https://hstspreload.org/removal/ |
| Chromium preload list source | https://source.chromium.org/chromium/chromium/src/+/main:net/http/transport_security_state_static.json |
