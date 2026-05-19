# Dashboard MCP Server

**File:** `scripts/mcp-servers/dashboard-mcp.mjs`  
**Transport:** stdio  
**Auth:** Cloudflare Access service token (no interactive login required)  
**Dashboard URL:** https://dashboard.careers-ops.com

The MCP server wraps Playwright headless Chromium to drive the career-ops dashboard. It's designed for use by council/agent sessions that need to read live widget state, click through drill-ins, or call dashboard APIs — without any human browser session.

---

## Setup

The server reads credentials from `.env` (via dotenv) or the shell environment:

```
DASHBOARD_MCP_SERVICE_TOKEN_ID=8a0698188bec8990ea109d817c27aed9.access
DASHBOARD_MCP_SERVICE_TOKEN_SECRET=<secret — see .env>
DASHBOARD_URL=https://dashboard.careers-ops.com   # optional, this is the default
```

These are already in `.env` as of 2026-05-19. The service token's Cloudflare Access policy expires **2027-05-19**.

---

## Using in a Claude Code instance

Add to `~/.claude/settings.json` (user-level) or `.mcp.json` (project-level, already written):

```json
{
  "mcpServers": {
    "dashboard": {
      "type": "stdio",
      "command": "node",
      "args": ["/Users/mitchellwilliams/Documents/career-ops/scripts/mcp-servers/dashboard-mcp.mjs"]
    }
  }
}
```

Then in Claude Code: `mcp__dashboard__dashboard_navigate`, `mcp__dashboard__dashboard_screenshot`, etc.

---

## Tool Reference

### `dashboard_navigate(path)`
Navigate to a dashboard path. Returns page title + current URL.

```json
{ "path": "/stories/comms-triage-agent.html" }
```

### `dashboard_render_widget(selector)`
Return rendered innerHTML + computed CSS (display, visibility, dimensions) for an element.

```json
{ "selector": "#sidebar-batch" }
```
Returns:
```json
{
  "innerHTML": "...",
  "display": "flex",
  "width": "240px",
  "rect": { "top": 420, "left": 0, "width": 240, "height": 120 }
}
```

### `dashboard_click_drill_in(target)`
Click an element and return the resulting popout/modal HTML.

```json
{ "target": ".apply-now-row[data-id='048']" }
```
or by visible text:
```json
{ "target": "View Report" }
```

### `dashboard_read_popout()`
Read the DOM tree of whichever modal/drawer is currently open.
No arguments. Returns HTML slice of the first visible modal/drawer/popout found.

### `dashboard_screenshot(selector?, full_page?, width?, height?)`
Capture a screenshot. Always ≤1999px per dimension (Anthropic API limit).

```json
{ "selector": "#runway-widget", "width": 1440, "height": 900 }
```
Returns base64 JPEG image content.

### `dashboard_list_widgets()`
Enumerate all visible widgets on the current page. Returns up to 80 elements with id, classes, text preview, and bounding rect.

No arguments.

### `dashboard_api_fetch(endpoint, method?, body?)`
Proxy a dashboard API call with service-token auth attached automatically.

```json
{ "endpoint": "/api/pipeline/preview" }
```
or:
```json
{ "endpoint": "/api/pipeline/process-all", "method": "POST", "body": {} }
```

---

## Example session

```
dashboard_navigate({ path: "/" })
→ "Navigated to https://dashboard.careers-ops.com/\nTitle: Career Ops"

dashboard_list_widgets({})
→ [{ "id": "sidebar-batch", "classes": "sidebar-batch-clickable", ... }, ...]

dashboard_render_widget({ selector: "#sidebar-batch" })
→ { "innerHTML": "⚡ Batch: 12/15 (80%)", "display": "block", ... }

dashboard_click_drill_in({ target: "#pipeline-modal-trigger" })
→ "Popout content after clicking ...: <div class='pipeline-modal-body'>..."

dashboard_api_fetch({ endpoint: "/api/pipeline/preview" })
→ "GET https://dashboard.careers-ops.com/api/pipeline/preview\nStatus: 200\n\n{...}"
```

---

## Adding this MCP to a new Claude Code instance

1. Copy `.mcp.json` from the repo root to the project you're working in (or add to global `~/.claude/settings.json`).
2. Ensure `DASHBOARD_MCP_SERVICE_TOKEN_ID` and `_SECRET` are in `.env` or your shell environment.
3. Run `claude` in the career-ops project — it will auto-connect the MCP server.

The service token policy (`non_identity`, precedence 2) allows the MCP server to bypass the email OTP flow entirely. The server's Playwright context sets the CF headers on every request so there's no redirect to the Access login page.
