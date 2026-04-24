# Web Terminal Fallback + Minimal Controls — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix PTY unavailable graceful fallback on Windows + add minimal control bar for fallback mode.

**Architecture:** One-file change (`web.go`). Server sends plain-text error + JSON status on WS, client checks `/health` before connecting, shows control bar in fallback mode.

**Tech Stack:** Go (embedded HTML/CSS/JS in web.go), xterm.js, gorilla/websocket.

---

## Files

- Modify: `D:\Career Ops\dashboard\web\web.go`
  - Section 1: lines ~153-158 (handleWebSocket fallback block)
  - Section 2: lines ~497-506 (HTML after `</style>` and before `<body>`)
  - Section 3: lines ~454-496 (CSS styles for `#controls`)
  - Section 4: lines ~600-651 (JavaScript connect function)

---

## Task 1: Fix server-side fallback — remove immediate close

**Goal:** When PTY is unavailable, send plain-text error + JSON status, then close cleanly instead of closing immediately.

- [ ] **Step 1: Read current fallback block**

File: `D:\Career Ops\dashboard\web\web.go`, lines ~153-158

Current code:
```go
if !ptyOk {
    // Send plain text (no ANSI) — xterm.js writes raw text as-is
    msg := "[PTY UNAVAILABLE]\r\n\r\nThis web terminal requires Linux/macOS.\r\nRun the TUI locally: go run main.go -path ..\r\n"
    conn.WriteMessage(websocket.TextMessage, []byte(msg))
    conn.Close()
    return
}
```

- [ ] **Step 2: Replace with new fallback block that sends JSON then closes**

Replace lines ~153-158 with:
```go
if !ptyOk {
    // Send plain text error message — xterm.js writes raw text as-is
    msg := "[PTY UNAVAILABLE]\r\n\r\nThis web terminal requires Linux/macOS.\r\nRun the TUI locally: go run main.go -path ..\r\n"
    conn.WriteMessage(websocket.TextMessage, []byte(msg))
    // Send JSON status so client knows fallback mode
    conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"pty_unavailable"}`))
    // Small delay so client receives the messages before close
    time.Sleep(200 * time.Millisecond)
    conn.Close()
    return
}
```

Note: Add `"time"` to imports if not present. Check import block (lines ~5-18).

- [ ] **Step 3: Verify it compiles**

```bash
cd D:/Career\ Ops/dashboard && go build ./...
```
Expected: no output (success)

---

## Task 2: Add `#controls` div to HTML

**Goal:** Add control bar HTML below the header, hidden by default.

- [ ] **Step 1: Read HTML section around line 507-515**

Find the `</div>` that closes the header div (around line 515).

- [ ] **Step 2: Add controls div after header**

After this line:
```html
<div id="header">
  ...
</div>
```

Insert:
```html

<!-- Control bar — visible in fallback mode only -->
<div id="controls" class="hidden">
  <button class="ctrl-btn" data-key="j" title="Move down (j)">▼ j</button>
  <button class="ctrl-btn" data-key="k" title="Move up (k)">▲ k</button>
  <button class="ctrl-btn" data-key="Enter" title="Open selected (Enter)">↵ Enter</button>
  <button class="ctrl-btn" data-key="r" title="Refresh (r)">↻ r</button>
  <button class="ctrl-btn" data-key="f" title="Filter (f)">⚡ f</button>
  <button class="ctrl-btn" data-key="p" title="Progress (p)">◐ p</button>
  <button class="ctrl-btn" data-key="o" title="Open URL (o)">🔗 o</button>
  <button class="ctrl-btn" data-key="q" title="Quit (q)">✕ q</button>
</div>
```

- [ ] **Step 3: Verify HTML is well-formed**

No build step needed for HTML — will be verified in browser.

---

## Task 3: Add CSS for `#controls` and buttons

**Goal:** Style the control bar to match the amber CRT aesthetic.

- [ ] **Step 1: Read CSS section around line ~454-496**

Find the closing `</style>` tag at line ~496.

- [ ] **Step 2: Add `#controls` styles before `</style>`**

Insert before `</style>`:
```css

  /* ── Control bar ── */
  #controls {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: var(--panel);
    border-bottom: 1px solid var(--border);
    position: relative;
    z-index: 10;
  }
  #controls.hidden { display: none; }

  .ctrl-btn {
    background: transparent;
    border: 1px solid var(--amber-dim);
    color: var(--amber);
    font-family: 'Share Tech Mono', monospace;
    font-size: 11px;
    padding: 4px 10px;
    cursor: pointer;
    border-radius: 2px;
    transition: all 0.15s ease;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .ctrl-btn:hover {
    background: rgba(255,176,0,0.15);
    border-color: var(--amber);
    box-shadow: 0 0 8px var(--amber-glow), inset 0 0 4px rgba(255,176,0,0.1);
    color: var(--amber);
  }
  .ctrl-btn:active {
    background: rgba(255,176,0,0.25);
    transform: scale(0.97);
  }
```

- [ ] **Step 3: Verify it compiles**

```bash
cd D:/Career\ Ops/dashboard && go build ./...
```
Expected: no output (success)

---

## Task 4: Rewrite JavaScript `connect()` to check `/health` first

**Goal:** Check PTY availability before attempting WS connection, handle fallback vs normal mode.

- [ ] **Step 1: Read current `connect()` function and surrounding code**

Find the `connect()` function (around line 608) and `const loading = document.getElementById('loading')` (around line 600).

- [ ] **Step 2: Replace the `connect()` function body**

The current `connect()` starts at line 608 and immediately creates a WebSocket. Replace it with:

```javascript
  function setStatus(text, cls, ledColor) {
    status.textContent = text;
    status.className = cls;
    connLed.className = 'led ' + ledColor;
  }

  // ── Health check + connect ──
  async function init() {
    try {
      const res = await fetch('/health');
      if (!res.ok) throw new Error('pty unavailable');

      // Normal mode: PTY is available
      setStatus('● Connected', 'ok', 'green');
      document.body.classList.add('connected');
      loading.classList.add('hidden');
      connectWS();
    } catch {
      // Fallback mode: PTY unavailable
      setStatus('⚠ PTY Unavailable', 'error', 'red');
      document.body.classList.remove('connected');
      loading.classList.add('hidden');
      showFallbackMode();
    }
  }

  function showFallbackMode() {
    // Show controls
    const controls = document.getElementById('controls');
    controls.classList.remove('hidden');

    // Write styled error to terminal
    term.write('\x1b[2J\x1b[H');
    term.write('\x1b[1;33m╔══════════════════════════════════════════════════════════╗\x1b[0m\r\n');
    term.write('\x1b[1;33m║        CAREER PIPELINE — MISSION CONTROL              ║\x1b[0m\r\n');
    term.write('\x1b[1;33m╚══════════════════════════════════════════════════════════╝\x1b[0m\r\n');
    term.write('\r\n');
    term.write('\x1b[1;31m[PTY UNAVAILABLE]\x1b[0m\r\n\r\n');
    term.write('\x1b[0;33mThis web terminal requires Linux/macOS.\x1b[0m\r\n');
    term.write('\x1b[0;33mRun the TUI locally: go run main.go -path ..\x1b[0m\r\n\r\n');
    term.write('\x1b[0;2mUse the control bar above to navigate.\x1b[0m\r\n');

    // Wire up control buttons to send keypresses to terminal
    document.querySelectorAll('.ctrl-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        if (key === 'Enter') term.write('\r');
        else if (key === 'r') term.write('r');
        else if (key === 'f') term.write('f');
        else if (key === 'p') term.write('p');
        else if (key === 'o') term.write('o');
        else if (key === 'q') term.write('q');
        else term.write(key);
      });
    });
  }

  function connectWS() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(protocol + '//' + location.host + '/ws');

    ws.onopen = () => {
      setStatus('● Connected', 'ok', 'green');
      document.body.classList.add('connected');
      // Boot banner
      term.write('\x1b[2J\x1b[H');
      term.write('\x1b[1;33m╔══════════════════════════════════════════════════════════╗\x1b[0m\r\n');
      term.write('\x1b[1;33m║        CAREER PIPELINE — MISSION CONTROL              ║\x1b[0m\r\n');
      term.write('\x1b[1;33m╚══════════════════════════════════════════════════════════╝\x1b[0m\r\n');
      term.write('\x1b[0;33m System online. Terminal ready.                      \x1b[0m\r\n');
      term.write('\x1b[2m Use j/k or arrow keys to navigate. Press q to quit.  \x1b[0m\r\n\r\n');

      const dims = fitAddon.proposeDimensions();
      if (dims) {
        ws.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
      }
    };

    ws.onclose = () => {
      setStatus('○ Reconnecting...', 'error', 'red');
      document.body.classList.remove('connected');
      term.write('\r\n\x1b[1;31m[!]\x1b[0m \x1b[33mConnection lost. Reconnecting...\x1b[0m\r\n');
      setTimeout(connectWS, 2000);
    };

    ws.onerror = () => {
      setStatus('⚠ Error', 'error', 'red');
    };

    ws.onmessage = (e) => {
      const d = e.data;
      if (typeof d === 'string') {
        // Check for pty_unavailable JSON
        if (d.includes('"type":"pty_unavailable"')) {
          ws.close();
          return;
        }
        term.write(d);
      } else if (d instanceof ArrayBuffer || d instanceof Blob) {
        const bytes = d instanceof Blob ? new Uint8Array(d) : new Uint8Array(d);
        term.write(bytes);
      }
    };
  }

  // Send keystrokes to PTY
  term.onData((data) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });

  // Send resize
  term.onResize(({ cols, rows }) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'resize', cols: cols, rows: rows }));
    }
  });

  // Start
  init();

  // Keepalive ping every 30s
  setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'ping' }));
    }
  }, 30000);
```

- [ ] **Step 3: Verify it compiles**

```bash
cd D:/Career\ Ops/dashboard && go build ./...
```
Expected: no output (success)

---

## Task 5: Verify and test

- [ ] **Step 1: Run the Go build**

```bash
cd D:/Career\ Ops/dashboard && go build ./...
```
Expected: no errors

- [ ] **Step 2: Start the server on Windows**

```bash
cd D:/Career\ Ops/dashboard && go run web/main.go -port 8080
```

Expected: Server starts, PTY bridge shows warning about unavailability, HTTP server listens on port 8080.

- [ ] **Step 3: Open browser to http://localhost:8080**

Expected on Windows:
- Loading overlay disappears immediately
- Terminal shows styled error message (amber/CRT aesthetic)
- Control bar is visible above the terminal with 8 buttons
- LED indicator shows red "PTY Unavailable"
- Clicking buttons sends keypresses to terminal

Expected on Linux/macOS:
- Loading overlay disappears
- Boot banner appears
- Terminal connects to PTY normally
- Control bar hidden
- LED indicator shows green "Connected"

---

## Verification Checklist

| Check | Windows | Linux/macOS |
|-------|---------|------------|
| Overlay disappears | ✓ | ✓ |
| Error message styled (ANSI) | ✓ | N/A |
| Control bar visible | ✓ | N/A |
| Control bar hidden | N/A | ✓ |
| LED shows correct state | ✓ | ✓ |
| Clicking buttons sends keys | ✓ | N/A |
| Normal WS connection works | N/A | ✓ |
