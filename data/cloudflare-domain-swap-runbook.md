# Cloudflare Domain Swap Runbook — `dashboard.careers-ops.com` → `dashboard.mitchellwilliams.com`

**Decision date:** 2026-05-09
**Why:** Domain research (`data/dashboard-domain-research-2026-05-09.md`) flagged `careers-ops.com` as 1/10 prestige (reads as a typo). `mitchellwilliams.com/dashboard` (or `dashboard.mitchellwilliams.com`) scored highest for the AI-native hiring-manager demo audience. Owning the personal-name domain compounds across future projects.

**Estimated time:** 5–10 minutes once `mitchellwilliams.com` is on Cloudflare nameservers.

---

## Pre-flight checks

1. **Do I own `mitchellwilliams.com`?**
   - If yes, skip to step 1.
   - If no, **stop**. Register it at Cloudflare Registrar (`dash.cloudflare.com → Domain Registration → Register Domains`). ~$10/yr. Then continue.

2. **Is `mitchellwilliams.com` on Cloudflare nameservers?**
   - Check at `dash.cloudflare.com → Websites`. If listed and "Active", skip to step 1.
   - If not, add the site (Free plan), copy the assigned NS records, update them at the registrar, wait for propagation (usually <1h, can be 24h).

---

## Step 1 — Add the new DNS route

```bash
cd /Users/mitchellwilliams
cloudflared tunnel route dns career-ops-dashboard dashboard.mitchellwilliams.com
```

This writes a new CNAME from `dashboard.mitchellwilliams.com → <tunnel-UUID>.cfargotunnel.com`. Cloudflare auto-provisions Universal SSL for the new hostname.

**Note:** `career-ops-dashboard` is the existing tunnel name. Don't create a new tunnel — the same tunnel can serve both hostnames simultaneously during the swap window.

## Step 2 — Update the tunnel config to serve the new hostname

Edit `~/.cloudflared/config.yml`:

```yaml
# career-ops dashboard tunnel — domain swap 2026-05-09
tunnel: e4202266-beec-43ba-a93e-80ff54ddf80e
credentials-file: /Users/mitchellwilliams/.cloudflared/e4202266-beec-43ba-a93e-80ff54ddf80e.json

ingress:
  # New canonical
  - hostname: dashboard.mitchellwilliams.com
    service: http://localhost:3000
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s
  # Old (keep during transition; remove after 30 days)
  - hostname: dashboard.careers-ops.com
    service: http://localhost:3000
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s
  - service: http_status:404
```

## Step 3 — Reload the tunnel

```bash
launchctl kickstart -k gui/$(id -u)/com.mitchell.career-ops.cloudflared
```

(`-k` kills the existing instance; launchd auto-restarts it with the new config because `KeepAlive=true` is set in the plist.)

## Step 4 — Set up Cloudflare Access on the new hostname

In `one.dash.cloudflare.com → Access → Applications`:

1. **Add application** → Self-hosted
2. Name: `career-ops dashboard`
3. Domain: `dashboard.mitchellwilliams.com`
4. Identity providers: enable **One-time PIN** + **Google**
5. Policy: Action `Allow`, Include rule `Emails` = `mitwilli@gmail.com`
6. Session duration: **30 days**

Repeat for `dashboard.careers-ops.com` (with same policy) so the legacy URL is also auth-protected during the transition window.

## Step 5 — Verify

```bash
# Should redirect to Cloudflare Access OTP/Google login
curl -sI https://dashboard.mitchellwilliams.com/ | head -5

# Same — should redirect after Step 4
curl -sI https://dashboard.careers-ops.com/ | head -5
```

Then on three devices (iPhone Safari, work laptop incognito, personal laptop): open `https://dashboard.mitchellwilliams.com`, complete OTP or Google SSO, confirm dashboard loads.

## Step 6 — Update internal references

After the new domain is verified working:

- [ ] Add `**Live:** https://dashboard.mitchellwilliams.com` to the top of `data/TODAY.md`
- [ ] Update any heartbeat/email templates that reference the old URL
- [ ] If a personal site exists at `mitchellwilliams.com`, add a footer link or `/dashboard` redirect entry

## Step 7 — Decommission the old hostname (~30 days later)

After 30 days of stable use on the new domain:

1. Remove the `dashboard.careers-ops.com` ingress block from `~/.cloudflared/config.yml`
2. Remove the corresponding Cloudflare Access policy
3. Reload the tunnel: `launchctl kickstart -k gui/$(id -u)/com.mitchell.career-ops.cloudflared`
4. Optionally: park `careers-ops.com` as a 301 → `mitchellwilliams.com/dashboard` for the renewal cycle, then drop next renewal.

---

## Rollback

If anything breaks during the swap, revert `~/.cloudflared/config.yml` to:

```yaml
tunnel: e4202266-beec-43ba-a93e-80ff54ddf80e
credentials-file: /Users/mitchellwilliams/.cloudflared/e4202266-beec-43ba-a93e-80ff54ddf80e.json

ingress:
  - hostname: dashboard.careers-ops.com
    service: http://localhost:3000
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s
  - service: http_status:404
```

Then `launchctl kickstart -k gui/$(id -u)/com.mitchell.career-ops.cloudflared`. Original setup restored within 10 seconds.
