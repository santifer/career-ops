# MCP PDF Server PTY/Process Leak Investigation — 2026-05-19

**Investigator:** Explore subagent (sonnet) delegated by orchestrator
**Mode:** read-only (no source edits, no upstream issues)
**Total runtime:** 9 minutes
**Final destination:** this file (orchestrator writes; subagent ran read-only)

## Root cause hypothesis

The `@modelcontextprotocol/server-pdf` v1.7.2 `StdioServerTransport` registers no `"end"` or `"close"` listener on `process.stdin`, so the Node.js event loop never drains after the parent claude CLI closes the pipe — the server runs indefinitely. Because Claude.app (Electron) uses `node-pty` to wrap each claude CLI subagent in a pty master, every stale mcp-pdf-server that blocks its claude CLI parent from exiting holds one `ptmx` file descriptor open in the Claude.app Electron process (PID 624), and macOS counts those devnodes against `kern.tty.ptmx_max: 511`.

## Evidence

### 1. Process lifecycle — no stdin EOF handling

`/Users/mitchellwilliams/.npm/_npx/6583fba12287d067/node_modules/@modelcontextprotocol/sdk/dist/cjs/server/stdio.js:32-68`

```js
async start() {
  this._stdin.on('data', this._ondata);   // line 37
  this._stdin.on('error', this._onerror); // line 38
  // NO 'end' or 'close' listener
}
async close() {
  this._stdin.off('data', this._ondata);
  this._stdin.off('error', this._onerror);
  const remainingDataListeners = this._stdin.listenerCount('data');
  if (remainingDataListeners === 0) {
    this._stdin.pause();      // line 63 — pauses but does NOT exit
  }
  this._readBuffer.clear();
  this.onclose?.();           // line 67 — onclose callback, but nobody calls process.exit()
}
```

The SDK's `StdioServerTransport` listens only for `data` and `error` on stdin. When the parent claude CLI closes its end of the socketpair (EOF), Node.js emits `"end"` on stdin — but no listener handles it, so the event loop stays alive indefinitely. There is no `SIGHUP` handler registered, and `SIGTERM`/`SIGINT` handlers are only registered in the HTTP server path, not the stdio path.

`/Users/mitchellwilliams/.npm/_npx/6583fba12287d067/node_modules/@modelcontextprotocol/server-pdf/dist/index.js.original-2026-05-19:34325-34327`

```js
async function startStdioServer(createServer2) {
  await createServer2().connect(new StdioServerTransport);
  // no signal handlers, no process.exit() on disconnect
}
```

Contrast with the HTTP path at line 34317-34323 which does register `SIGINT`/`SIGTERM` → `process.exit(0)`. The stdio path has nothing.

### 2. PTY allocation — Claude.app Electron via node-pty, NOT the MCP server itself

Live observation (2026-05-19 ~15:03 PT):

- All 10 running `node .../mcp-pdf-server --stdio` processes (PIDs 2812, 3770, 4620, 5025, 6196, 6861, 7720, 9373, 9953, 10530) show FD 0/1/2 as **unix domain sockets**, not pty slaves.
- `lsof -p 2812` confirms: `0u unix ... 1u unix ... 2u unix` — no `/dev/ttysXXX` entry.
- `lsof -p 624` (Claude.app Electron, the desktop process) shows **79 `/dev/ptmx`** master devices open right now. Terminal.app holds only 1.

```
Claude  624  ...  93u  CHR  15,1  /dev/ptmx
Claude  624  ...  95u  CHR  15,2  /dev/ptmx
Claude  624  ...  100u CHR  15,3  /dev/ptmx
... (79 total)
```

The `node-pty` native addon is present at `/Applications/Claude.app/Contents/Resources/app.asar.unpacked/node_modules/node-pty/build/Release/pty.node`.

The causal chain: **each claude CLI subagent** is wrapped by Claude.app via node-pty (1 ptmx per subagent terminal session). The Bash tool executions within each subagent each consume additional ptmx entries. As long as `mcp-pdf-server` keeps its parent claude CLI alive, Claude.app's node-pty never closes the corresponding ptmx FD.

With 22 claude CLI subagents currently running and 79 ptmx open, the ratio (~3.5 ptmx/subagent) accounts for both the subagent terminal and its Bash tool sessions.

At the first incident: 38 stale mcp-pdf-servers + normal session overhead + Terminal.app tabs = 527 ptmx against a cap of 511.

### 3. Why `enabledPlugins: { "pdf-viewer": false }` in `settings.json` failed

From the claude CLI binary strings (`strings .../claude | grep "opt out"`):

```
To opt out, set "enabledPlugins": {"<pluginId>": false} in .claude/settings.local.json.
```

The binary's own opt-out help text specifies **`settings.local.json`**, not `settings.json`. Mitchell placed the opt-out in `~/.claude/settings.json` (the "user" scope). The binary reads `--setting-sources=user,project,local` where `local` = `settings.local.json`. That file does **not exist**:

```
$ ls ~/.claude/settings.local.json
settings.local.json does not exist
```

Additionally, the binary contains a second message: `"This comes from the --settings flag; .claude/settings.local.json won't override it."` — meaning if Claude.app passes `--settings` inline, even `settings.local.json` is bypassed. Most subagents don't get `--settings` so `settings.local.json` should work for normal invocations.

The `claude plugin disable pdf-viewer` path also fails because `pdf-viewer` is a built-in inline plugin compiled into the claude CLI binary, not listed under any editable plugin scope. `claude plugin list` returns empty.

### 4. Current mitigation status (bin stub — ALREADY INSTALLED)

`/Users/mitchellwilliams/.npm/_npx/6583fba12287d067/node_modules/@modelcontextprotocol/server-pdf/dist/index.js:1-22` — replaced with a 22-line stub that calls `process.exit(0)` immediately.

Stub installed at 14:36 PT (file mtime: `May 19 14:36`). **NOT installed by this session's orchestrator** — likely installed by one of the parallel Claude sessions during overnight haul work. All 10 currently-running mcp-pdf-server processes started at 14:32-14:34 PT (before the stub). Highest PID observed is 10530. No new processes have appeared since 14:36. **The stub is working for new spawns.**

Pre-stub zombies persist because:
1. They loaded the original `index.js` into V8 memory at spawn time.
2. Their stdin unix sockets remain open (Claude.app parent still alive).
3. They will self-terminate when their parent claude CLI subagents eventually exit.

## Why current mitigations failed (summary)

| Mitigation | Why it failed |
|---|---|
| `enabledPlugins: {"pdf-viewer": false}` in `~/.claude/settings.json` | Binary opt-out path requires `~/.claude/settings.local.json`, not `settings.json` |
| `claude plugin disable pdf-viewer` | Built-in inline plugins are not in any editable plugin scope |
| `pkill mcp-pdf-server` | Kills processes but macOS kernel retains ptmx devnode until owning FD (in Claude.app) is closed |
| Reboot | Clears kernel state but Claude.app re-spawns servers immediately on next session open |

## Candidate fixes

| Name | Description | Effort | Reliability | Reversibility |
|---|---|---|---|---|
| **settings.local.json opt-out** | Create `~/.claude/settings.local.json` with `{"enabledPlugins": {"pdf-viewer": false}}` | Minimal (1 file) | High if the pluginId string is correct; unknown if `pdf-viewer` is the exact key | Trivially reversible (delete the key) |
| **Bin stub (current)** | Replace `dist/index.js` with `process.exit(0)` stub | Already done | Works for new spawns; breaks on `npm install` rehydration | Manual: swap back `.original-2026-05-19` |
| **Wrapper script with idle kill** | Replace stub with a wrapper that starts the real server but installs `stdin.on("end", () => process.exit(0))` and a 30s idle watchdog | Low-medium | High; covers both disconnect and hang cases | Moderate: file needs maintenance |
| **Launchd watchdog to re-apply stub** | LaunchAgent that `FSEventsWatch`es the npx cache dir and re-installs the stub when `index.js` changes | Medium | High durability against npm cache refresh | Easy to unload/disable |
| **`kern.tty.ptmx_max` increase** | `sudo sysctl kern.tty.ptmx_max=2048` (set in `/etc/sysctl.conf` for persistence) | Low | Buys headroom; does not fix root cause | Fully reversible |
| **Upstream SDK fix** | Add `process.stdin.on("end", () => process.exit(0))` to `StdioServerTransport.start()` in `@modelcontextprotocol/sdk` | Low code change; requires upstream PR + npm publish | Permanent fix | n/a |

## Open questions / unknowns

1. **Exact `enabledPlugins` key for pdf-viewer**: The binary opt-out string has a dynamic placeholder (`{"<pluginId>": false}`). The actual pluginId could be `pdf-viewer`, `pdf_viewer`, or something else. Cannot confirm without a test run with `settings.local.json`.

2. **Why does Claude.app spawn a new mcp-pdf-server for EACH sub-agent instead of reusing one?** Each of the 10+ independent claude CLI subagents gets its own server instance. If the MCP server were shared (session-scoped vs process-scoped), the count would be bounded.

3. **macOS Tahoe-specific behavior**: The incident notes say "kill ≠ fix, only reboot clears them" and "kernel-level pty bookkeeping leak." Whether this is a macOS 26 regression or expected behavior for abnormally-closed ptys is unconfirmed.

4. **Does `--settings {"fastMode":false}` (passed to some subagents) prevent `settings.local.json` from working?** The binary message says the `--settings` flag blocks local override. Three of the 22 claude instances include this flag.

5. **Does a graceful exit of mcp-pdf-server actually release the ptmx in Claude.app?** The stub process exits in <100ms but its parent claude CLI must also exit cleanly for Claude.app to close the node-pty session and free the ptmx FD.

## Recommendations for Anthropic feedback (NOT yet filed — needs Mitchell approval per `feedback_never_touch_upstream`)

**Bug report wording (for Anthropic support/GitHub):**

> `@modelcontextprotocol/server-pdf` v1.7.2 (and the `@modelcontextprotocol/sdk` v1.29.0 `StdioServerTransport`) does not handle stdin EOF. When Claude Code's MCP client terminates its end of the stdio socketpair, the server process never receives a signal it handles and keeps its event loop alive indefinitely. On macOS, each live claude CLI subagent holds a `ptmx` master via the desktop app's node-pty integration. After ~38 concurrent stale servers the system exhausted `kern.tty.ptmx_max: 511` (macOS 26 Tahoe), causing `forkpty: Device not configured` in all terminals. **Requested fix**: add `process.stdin.on("end", () => process.exit(0))` (or equivalent) to `StdioServerTransport.start()` in the MCP SDK.

**Feature request wording:**

> Claude Code's built-in `pdf-viewer` plugin cannot be disabled via `claude plugin disable` ("not found in any editable settings scope") and the `settings.json` `enabledPlugins` key appears to require `settings.local.json` specifically (binary opt-out message targets that file). **Requested**: (1) Document the exact opt-out key shape and correct settings file for built-in inline plugins. (2) Make `claude plugin disable <builtin-plugin-name>` work for built-in plugins by writing the opt-out to `settings.local.json` automatically.

## Next action for Mitchell

Create `~/.claude/settings.local.json` with `{"enabledPlugins": {"pdf-viewer": false}}` to test the correct opt-out path. If that doesn't bind, the bin stub (already in place at 14:36 PT) is doing the work — but it's fragile against `npm install`/cache refresh.
