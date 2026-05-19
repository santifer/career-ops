# Cloudflare Access Policy — dashboard.careers-ops.com

**Updated:** 2026-05-19  
**Protected app:** `dashboard.careers-ops.com`  
**App ID:** `4e72a3c3-11c1-4217-aef0-32f31e5cfc27`  
**Account ID:** `7dc467f52c575cfa4d4093ef0b64326e`  
**Team:** `mitwilli.cloudflareaccess.com`  
**CF Access token env var:** `CLOUDFLARE_ACCESS_TOKEN` (permission: Access:Apps+Policies:Edit, Access:ServiceTokens:Edit)

---

## Policies (2 active)

### 1. Mitchell allow (`allow`, precedence 1)
Session duration: **24h**

| Type | Value |
|------|-------|
| email | mitwilli@gmail.com |
| email | mitwilli+council-bot@gmail.com |

- `mitwilli+council-bot@gmail.com` is a Gmail alias — mail routes to Mitchell's primary inbox.
- The `+council-bot` tag exists so Mitchell can filter/revoke independently via Gmail filters.
- Session is 24h so council agents that authenticate with it stay active for a full run.

### 2. dashboard-mcp-service-token (`non_identity`, precedence 2)
Session duration: **8760h (1 year)**  
Expires: 2027-05-19

| Type | Value |
|------|-------|
| service_token | ID `201039c3-e220-4643-8c4c-4c6423a71093` |

- Used by `scripts/mcp-servers/dashboard-mcp.mjs` for headless Playwright auth.
- Credentials stored in `.env` as `DASHBOARD_MCP_SERVICE_TOKEN_ID` and `DASHBOARD_MCP_SERVICE_TOKEN_SECRET`.
- Auth header: `CF-Access-Client-Id: <ID>` + `CF-Access-Client-Secret: <SECRET>`.

---

## How to revoke council-bot access

```bash
# Remove the email from the Mitchell allow policy:
CF_TOKEN="$CLOUDFLARE_ACCESS_TOKEN"
curl -X PUT "https://api.cloudflare.com/client/v4/accounts/7dc467f52c575cfa4d4093ef0b64326e/access/policies/62a8b2ea-9fcb-47b1-bf25-7b9685734697" \
  -H "Authorization: Bearer $CF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"decision":"allow","include":[{"email":{"email":"mitwilli@gmail.com"}}],"exclude":[],"require":[],"name":"Mitchell allow","session_duration":"24h"}'
```

## How to revoke the MCP service token

```bash
CF_TOKEN="$CLOUDFLARE_ACCESS_TOKEN"
curl -X DELETE "https://api.cloudflare.com/client/v4/accounts/7dc467f52c575cfa4d4093ef0b64326e/access/service_tokens/201039c3-e220-4643-8c4c-4c6423a71093" \
  -H "Authorization: Bearer $CF_TOKEN"
```
