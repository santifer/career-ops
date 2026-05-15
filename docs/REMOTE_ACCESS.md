# Remote dashboard access

The career-ops dashboard server runs on `127.0.0.1:7777` by design — read [dashboard-server.mjs](../dashboard-server.mjs) for the rationale. To reach it from your phone, work laptop, or anywhere off the home network, this guide sets up a **Cloudflare Tunnel + Cloudflare Access**: a stable HTTPS URL protected by an email magic link.

**Why Cloudflare Tunnel + Access:**

- No port forwarding, no exposed home IP, no static IP needed.
- Stable URL on a domain you own.
- Auth via email magic link (Cloudflare Access). Works on any device with a browser — no client install.
- Free for personal use.

**Trade-offs you should know:**

- The tunnel only serves traffic while your Mac is awake and the dashboard server is running. If your laptop sleeps, the URL goes dark until it wakes up.
- You need a domain in Cloudflare. If you don't already have one, you can register one through Cloudflare Registrar at cost (~$10/yr for `.com`).
- The "Mark Applied" button hits the same server, so it only works while the tunnel is up.

---

## Prerequisites

- Cloudflare account (free tier).
- A domain managed by Cloudflare (you've added the domain in the Cloudflare dashboard and updated nameservers).
- `cloudflared` installed (already done if you ran `brew install cloudflared`).
- The dashboard server is running (it should already be — check with `launchctl list | grep career-ops`).

---

## One-shot setup

Run:

```bash
./scripts/setup-cloudflare-tunnel.sh
```

This walks through five steps interactively:

1. **Browser auth.** Opens a Cloudflare login page. You pick the domain you want to use for the tunnel. A `~/.cloudflared/cert.pem` file is written.
2. **Tunnel create.** Creates a tunnel called `career-ops-dashboard` on your account. Writes credentials to `~/.cloudflared/<UUID>.json`.
3. **Hostname pick.** You choose a subdomain — e.g., `careerops.yourdomain.com`.
4. **Config + DNS.** Writes `~/.cloudflared/config.yml` (routes the tunnel to `localhost:7777`) and creates a CNAME DNS record pointing the subdomain at the tunnel.
5. **launchd install.** Copies [scripts/launchd/com.mitchell.career-ops.cloudflared.plist](../scripts/launchd/com.mitchell.career-ops.cloudflared.plist) to `~/Library/LaunchAgents/` and loads it. The tunnel now starts automatically at login.

After this finishes, the URL is **publicly accessible** — anyone who guesses or finds it can read your dashboard. The next step locks it down.

---

## Locking it down with Cloudflare Access

This is the part the setup script can't automate (Cloudflare's UI is the only path).

1. Open [https://one.dash.cloudflare.com](https://one.dash.cloudflare.com) → **Access** → **Applications**.
2. Click **Add an application** → **Self-hosted**.
3. Application configuration:
   - **Application name:** `career-ops dashboard`
   - **Session duration:** 24 hours (default — bumps to 1 month if you re-auth daily and don't want to)
   - **Application domain:** the subdomain you chose, e.g. `careerops.yourdomain.com`
4. Click **Next** to add an access policy:
   - **Policy name:** `Mitchell only`
   - **Action:** `Allow`
   - **Configure rules → Include:** `Emails` → `mitwilli@gmail.com`
5. Click **Next** → **Setup → Add application**. Default settings (CORS off, identity providers default) are fine.

Now every request to the tunnel URL gets intercepted by Cloudflare. First-time on each device, you enter your email and click a magic link in your inbox. After that, the session sticks for the duration you chose.

---

## Testing it

```bash
# Open the public URL in your phone's browser
open https://careerops.yourdomain.com
```

You should see the email-prompt page from Cloudflare Access. Enter your email → click the link in your inbox → land on the dashboard.

Test the **Mark Applied** flow from email:

1. Wait for tomorrow's heartbeat (or run `node scripts/heartbeat.mjs --send` manually).
2. Open the email on your phone.
3. Click any `✅ Applied` link. Cloudflare Access prompts for your email → magic link → confirmation page renders.
4. Verify the row's status flipped: open `data/applications.md` locally or check the dashboard.

---

## Troubleshooting

**Can't reach the URL at all (timeout or DNS error)**

- Wait 30-60 seconds after running the setup script — DNS propagation.
- Check `~/.cloudflared/config.yml` has the right tunnel UUID and hostname.
- Check the tunnel is running: `launchctl list | grep cloudflared`. If not loaded, run `launchctl load ~/Library/LaunchAgents/com.mitchell.career-ops.cloudflared.plist`.
- Check tunnel logs: `tail -50 data/logs/cloudflared.err`.

**URL works but always 502 / 522**

- The dashboard server might not be running on port 7777. Check: `lsof -i :7777`.
- Restart it: `launchctl kickstart -k gui/$(id -u)/com.mitchell.career-ops.dashboard-server`.

**Mark Applied page works, but writing to applications.md fails**

- Permission issue on the tracker file. Check: `ls -la data/applications.md` — the file should be writable by your user.
- Path mismatch: `cwd` for the launchd-managed dashboard server is set in [com.mitchell.career-ops.dashboard-server.plist](../../Library/LaunchAgents/com.mitchell.career-ops.dashboard-server.plist) — it must be the project root.

**Cloudflare Access keeps asking for the magic link on every visit**

- Bump session duration in the Application settings (Access → Applications → your app → Edit).
- 24 hours is the default; 1 week or 1 month is fine for personal use.

---

## Tearing it down

```bash
# Stop the tunnel
launchctl unload ~/Library/LaunchAgents/com.mitchell.career-ops.cloudflared.plist
rm ~/Library/LaunchAgents/com.mitchell.career-ops.cloudflared.plist

# Delete the tunnel from Cloudflare
cloudflared tunnel delete career-ops-dashboard

# Remove the DNS record from the Cloudflare dashboard manually
# (one.dash.cloudflare.com → DNS → delete the CNAME for your subdomain)

# Optional: revoke cloudflared auth
rm -rf ~/.cloudflared
```

---

## Security notes

- The tunnel and Access policy together mean: only people with the URL **and** access to your email can read the dashboard. Set the Access policy to `Allow` only your email — nothing else.
- The dashboard contains evaluation reports, application history, comp targets, and outreach drafts. Treat the URL as semi-sensitive. Don't paste it into shared chats or screen shares.
- The `/mark` endpoint mutates state via GET. This is safe behind Cloudflare Access (prefetchers can't authenticate), but if you ever disable Access, switch to a POST endpoint or add a per-email signed token. See the comment block at the top of `handleMarkRequest` in [dashboard-server.mjs](../dashboard-server.mjs).
