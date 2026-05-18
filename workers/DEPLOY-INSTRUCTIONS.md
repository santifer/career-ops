# Wave H4 — CSP Nonce Worker Deploy Instructions

Covers D20 (CSP nonce strict policy) and D24 (HSTS preload).  
All commands run from the repo root unless noted.

---

## Prerequisites

| What | Check |
|------|-------|
| Cloudflare account with Workers access | Log in at dash.cloudflare.com |
| Zone `careers-ops.com` added to Cloudflare | DNS must be proxied (orange cloud) |
| Wrangler CLI | `wrangler --version` — install below if missing |

---

## Step 1 — Install Wrangler (if not installed)

```bash
npm install -g wrangler
wrangler --version   # confirm >= 3.x
```

---

## Step 2 — Authenticate to Cloudflare

```bash
wrangler login
```

This opens a browser window. Authorize with the Cloudflare account that owns the `careers-ops.com` zone.

---

## Step 3 — (Optional) Create KV namespace for CSP reports

Skip this step if you only want `wrangler tail` log output and don't need persistent report storage.

```bash
# Staging namespace
wrangler kv:namespace create "CSP_REPORTS" --env staging

# Production namespace
wrangler kv:namespace create "CSP_REPORTS"
```

Each command prints a namespace ID. Paste those IDs into `workers/wrangler-csp-deploy.toml` in the `[[env.staging.kv_namespaces]]` and `[[env.production.kv_namespaces]]` blocks (currently commented out).

---

## Step 4 — Update ORIGIN_URL in wrangler config

Open `workers/wrangler-csp-deploy.toml` and update the `ORIGIN_URL` values under `[env.staging.vars]` and `[env.production.vars]` to point at your actual Cloudflare Tunnel hostnames or origin server addresses.

---

## Step 5 — Deploy to staging

```bash
wrangler deploy --config workers/wrangler-csp-deploy.toml --env staging
```

---

## Step 6 — Verify staging headers

```bash
curl -sI https://staging-dashboard.careers-ops.com/ \
  | grep -Ei '^(content-security-policy|strict-transport-security)'
```

Expected output (report-only mode):

```
content-security-policy-report-only: default-src 'self' https:; script-src 'self' 'nonce-XXXXXXXXXXXXXXXX' 'strict-dynamic'; ...
strict-transport-security: max-age=63072000; includeSubDomains; preload
```

If either header is missing, check `wrangler tail --env staging` for errors.

---

## Step 7 — Watch staging for 24 hours

Stream CSP violation reports in real time:

```bash
wrangler tail --env staging
```

Look for lines starting with `[CSP-REPORT]`. Investigate any violations before moving to production. Common false-positive sources:

- Browser extensions injecting inline scripts (expected — not your code)
- Third-party widgets loaded via `<script src>` that call `eval()` (fix: add domain to `script-src` or use `strict-dynamic` inheritance)

---

## Step 8 — Deploy to production

Once staging is clean for 24+ hours:

```bash
wrangler deploy --config workers/wrangler-csp-deploy.toml --env production
```

---

## Step 9 — Verify production headers

```bash
curl -sI https://dashboard.careers-ops.com/ \
  | grep -Ei '^(content-security-policy|strict-transport-security)'
```

Same expected output as Step 6.

---

## Step 10 — Monitor production for 7 days (Report-Only window)

```bash
wrangler tail --env production
```

Keep `CSP_ENFORCE_MODE` unset (report-only) during this window. After 7 days of clean reports with no legitimate violations from real user traffic, proceed to enforcement.

---

## Step 11 — Flip to enforcement mode (after 7 clean days)

1. Open `workers/wrangler-csp-deploy.toml`
2. Under `[env.production.vars]`, change:
   ```toml
   CSP_ENFORCE_MODE = ""
   ```
   to:
   ```toml
   CSP_ENFORCE_MODE = "enforce"
   ```
3. Redeploy:
   ```bash
   wrangler deploy --config workers/wrangler-csp-deploy.toml --env production
   ```
4. Verify the header name changed from `Content-Security-Policy-Report-Only` to `Content-Security-Policy`:
   ```bash
   curl -sI https://dashboard.careers-ops.com/ | grep -i content-security-policy
   ```

---

## Step 12 — Submit HSTS preload (after 14 clean enforce days)

See `workers/HSTS-PRELOAD-SUBMIT.md` for the complete submission checklist.

---

## Rollback

If production breaks, roll back to the previous Worker version in seconds:

```bash
wrangler rollback --env production
```

This reverts the Worker to the last successful deployment. No config edits needed.

To verify the rollback:

```bash
curl -sI https://dashboard.careers-ops.com/ | grep content-security-policy
# Should no longer show the nonce-based CSP if pre-worker version had none.
```

---

## Full command reference

| Action | Command |
|--------|---------|
| Deploy staging | `wrangler deploy --config workers/wrangler-csp-deploy.toml --env staging` |
| Deploy production | `wrangler deploy --config workers/wrangler-csp-deploy.toml --env production` |
| Stream live logs | `wrangler tail --env production` |
| Roll back production | `wrangler rollback --env production` |
| List deployments | `wrangler deployments list --env production` |
| Create KV namespace | `wrangler kv:namespace create "CSP_REPORTS"` |
| List KV keys | `wrangler kv:key list --namespace-id <id>` |
| Read a KV violation | `wrangler kv:key get --namespace-id <id> <key>` |

---

## Caveats

1. **Staging environment**: `staging-dashboard.careers-ops.com` must exist as a DNS record in the Cloudflare zone before you can deploy the staging Worker route. Add a CNAME or A record pointing to your origin (proxied, orange cloud) before running Step 5.

2. **KV namespace IDs**: If you skip KV in Step 3, the `KV_CSP_REPORTS` binding will be absent at runtime. The Worker handles this gracefully — it logs to `wrangler tail` only and does not error.

3. **ORIGIN_URL and Cloudflare Access JWT**: The Worker forwards all headers to the origin, including the `Cf-Access-Jwt-Assertion` header set by Cloudflare Access. The origin must still validate this JWT. No changes to the Access policy are needed.

4. **HTMLRewriter and streaming**: HTMLRewriter is synchronous and streams — it does not buffer the full HTML body. Large dashboard pages will not cause memory pressure.

5. **`require-trusted-types-for 'script'`**: This directive is enforced only in Chromium-based browsers. Safari and Firefox ignore it silently. It is a forward-looking guard and will not cause breakage in non-supporting browsers.

6. **`strict-dynamic` and nonce propagation**: Scripts loaded by a nonced `<script>` tag inherit trust automatically via `strict-dynamic`. Third-party scripts that load child scripts do NOT need their own nonce — they are trusted transitively. If you see violations for dynamically-loaded scripts, the parent `<script>` tag needs the nonce, not the child.
