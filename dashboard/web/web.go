//go:build !ignore

package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"net/http/httputil"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin:     func(r *http.Request) bool { return true },
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
}

type session struct {
	conn   *websocket.Conn
	bridge *PtyBridge
	done   chan struct{}
}

var (
	sessions   = make(map[*session]bool)
	sessionsMu sync.RWMutex
	bridge     *PtyBridge
	bridgeMu   sync.Mutex
)

func main() {
	httpPort := flag.String("port", "8080", "HTTP port for web terminal")
	goPath := flag.String("gobin", "go", "Path to go binary")
	flag.Parse()

	// Start the TUI process under PTY control
	argv := flag.Args()
	if len(argv) == 0 {
		argv = []string{"run", "main.go", "-path", ".."}
	}

	log.Printf("Starting PTY bridge for: go %s", strings.Join(argv, " "))

	cmd := exec.Command(*goPath, argv...)
	cmd.Env = os.Environ()
	cmd.Env = append(cmd.Env, "TERM=xterm-256color")
	cmd.Env = append(cmd.Env, "FORCE_COLOR=1")

	bridge = &PtyBridge{}
	var err error
	bridge.ptyFile, bridge.process, err = startPty(cmd)
	if err != nil {
		log.Printf("Warning: PTY bridge unavailable (%v). Web terminal will display a connection error.", err)
	} else {
		bridge.stdin = bridge.ptyFile
		bridge.stdout = bridge.ptyFile
	}

	// Start output pump from PTY to sessions
	go pumpOutput()

	// HTTP server
	addr := fmt.Sprintf("localhost:%s", *httpPort)
	http.HandleFunc("/ws", handleWebSocket)
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		bridgeMu.Lock()
		ptyOk := bridge != nil && bridge.ptyFile != nil
		bridgeMu.Unlock()
		if ptyOk {
			w.WriteHeader(http.StatusOK)
			w.Write([]byte("ok"))
		} else {
			w.WriteHeader(http.StatusServiceUnavailable)
			w.Write([]byte("pty unavailable"))
		}
	})
	http.HandleFunc("/", handleIndex)

	log.Printf("")
	log.Printf("╔═══════════════════════════════════════════════════════════╗")
	log.Printf("║     Career Pipeline Web Terminal — http://%s       ║", addr)
	log.Printf("║                                                           ║")
	log.Printf("║     Open in browser to interact with the TUI           ║")
	log.Printf("╚═══════════════════════════════════════════════════════════╝")
	log.Printf("")

	if err := http.ListenAndServe(addr, nil); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}

func pumpOutput() {
	buf := make([]byte, 8192)
	for {
		n, err := bridge.Read(buf)
		if n > 0 {
			broadcastBinary(buf[:n])
		}
		if err != nil || n == 0 {
			time.Sleep(10 * time.Millisecond)
		}
		if bridge == nil || bridge.ptyFile == nil {
			break
		}
	}
}

func broadcastBinary(data []byte) {
	sessionsMu.RLock()
	defer sessionsMu.RUnlock()
	for s := range sessions {
		if err := s.conn.WriteMessage(websocket.BinaryMessage, data); err != nil {
			log.Printf("write error to session: %v", err)
		}
	}
}

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("websocket upgrade error: %v", err)
		return
	}

	s := &session{conn: conn, done: make(chan struct{})}
	sessionsMu.Lock()
	sessions[s] = true
	sessionsMu.Unlock()

	log.Printf("Client connected (total: %d)", len(sessions))

	defer func() {
		sessionsMu.Lock()
		delete(sessions, s)
		sessionsMu.Unlock()
		conn.Close()
		log.Printf("Client disconnected (total: %d)", len(sessions))
	}()

	// Check PTY availability
	bridgeMu.Lock()
	ptyOk := bridge != nil && bridge.ptyFile != nil
	bridgeMu.Unlock()

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

	// Send initial terminal setup
	conn.WriteMessage(websocket.TextMessage, []byte("\x1b[2J\x1b[H")) // Clear screen

	// Goroutine to pump PTY output to this session
	go func() {
		buf := make([]byte, 4096)
		for {
			n, err := bridge.Read(buf)
			if n > 0 {
				conn.WriteMessage(websocket.BinaryMessage, buf[:n])
			}
			if err != nil {
				break
			}
		}
	}()

	// Read from WebSocket → send to PTY
	for {
		msgType, msg, err := conn.ReadMessage()
		if err != nil {
			break
		}

		if msgType == websocket.TextMessage {
			// Parse JSON command
			if len(msg) > 0 && msg[0] == '{' {
				handleJSONCommand(msg, conn)
			} else {
				// Raw data — write to PTY stdin
				bridge.Write(msg)
			}
		} else if msgType == websocket.BinaryMessage {
			bridge.Write(msg)
		}
	}
}

func handleJSONCommand(msg []byte, conn *websocket.Conn) {
	// Simple JSON parsing without external deps
	s := string(msg)

	if strings.Contains(s, `"type":"resize"`) {
		// Extract cols and rows
		cols := 120
		rows := 40
		fmt.Sscanf(s, `{"type":"resize","cols":%d,"rows":%d}`, &cols, &rows)
		if err := bridge.ResizeTerminal(cols, rows); err != nil {
			log.Printf("resize error: %v", err)
		}
	} else if strings.Contains(s, `"type":"ping"`) {
		conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"pong"}`))
	}
}

func handleIndex(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		// Proxy to localhost:3000 for dev assets
		if strings.HasPrefix(r.URL.Path, "/xterm") || strings.HasPrefix(r.URL.Path, "/dist") {
			director := func(r *http.Request) {
				r.URL.Scheme = "http"
				r.URL.Host = "localhost:3000"
			}
			proxy := &httputil.ReverseProxy{Director: director}
			proxy.ServeHTTP(w, r)
			return
		}
		http.NotFound(w, r)
		return
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	fmt.Fprint(w, indexHTML)
}

const indexHTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Career Pipeline — Mission Control</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Oxanium:wght@400;600;700&family=Share+Tech+Mono&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.css">
<style>
  /* ── CRT phosphor / amber mission-control aesthetic ── */
  :root {
    --bg:        #050a05;
    --amber:     #ffb000;
    --amber-dim: #b37800;
    --amber-glow: rgba(255,176,0,0.45);
    --green-led:  #39ff14;
    --red-led:    #ff3131;
    --panel:      #0a140a;
    --border:     #1a2e1a;
    --scanline:   rgba(0,0,0,0.08);
  }

  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

  html, body {
    width: 100%; height: 100%;
    background: var(--bg);
    overflow: hidden;
    font-family: 'Oxanium', monospace;
    color: var(--amber);
  }

  /* ── Scanline overlay ── */
  body::before {
    content: '';
    position: fixed; inset: 0;
    background: repeating-linear-gradient(
      to bottom,
      transparent 0px, transparent 2px,
      var(--scanline) 2px, var(--scanline) 4px
    );
    pointer-events: none;
    z-index: 200;
  }

  /* ── CRT vignette ── */
  body::after {
    content: '';
    position: fixed; inset: 0;
    background: radial-gradient(ellipse at center,
      transparent 55%,
      rgba(0,0,0,0.7) 100%
    );
    pointer-events: none;
    z-index: 201;
  }

  /* ── Main layout ── */
  #app {
    display: grid;
    grid-template-rows: 56px 1fr 44px;
    height: 100vh;
    position: relative;
  }

  /* ── Header bar ── */
  #header {
    background: var(--panel);
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    padding: 0 20px;
    gap: 16px;
    position: relative;
    z-index: 10;
  }

  #header::after {
    content: '';
    position: absolute;
    bottom: 0; left: 0; right: 0;
    height: 1px;
    background: linear-gradient(90deg,
      transparent, var(--amber-dim), var(--amber), var(--amber-dim), transparent
    );
    box-shadow: 0 0 8px var(--amber-glow);
  }

  .header-corner {
    font-family: 'Share Tech Mono', monospace;
    font-size: 11px;
    color: var(--amber-dim);
    letter-spacing: 0.1em;
  }

  #header-title {
    flex: 1;
    text-align: center;
  }

  #header-title h1 {
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.25em;
    text-transform: uppercase;
    color: var(--amber);
    text-shadow: 0 0 12px var(--amber-glow), 0 0 24px var(--amber-glow);
  }

  #header-title span {
    font-size: 10px;
    color: var(--amber-dim);
    letter-spacing: 0.15em;
  }

  /* ── LED indicators ── */
  .led {
    width: 8px; height: 8px;
    border-radius: 50%;
    display: inline-block;
    margin-right: 6px;
    box-shadow: 0 0 4px currentColor;
  }
  .led.green { background: var(--green-led); color: var(--green-led); animation: led-pulse 2s ease-in-out infinite; }
  .led.red   { background: var(--red-led);   color: var(--red-led);   animation: led-pulse 1s ease-in-out infinite; }

  @keyframes led-pulse {
    0%, 100% { opacity: 1; box-shadow: 0 0 4px currentColor; }
    50%       { opacity: 0.5; box-shadow: 0 0 10px currentColor; }
  }

  /* ── Terminal container ── */
  #terminal-wrap {
    position: relative;
    overflow: hidden;
    background: var(--bg);
  }

  /* Corner brackets */
  .bracket {
    position: absolute;
    width: 20px; height: 20px;
    z-index: 20;
    pointer-events: none;
  }
  .bracket::before, .bracket::after {
    content: '';
    position: absolute;
    background: var(--amber-dim);
    transition: background 0.3s, box-shadow 0.3s;
  }
  .bracket.tl { top: 8px; left: 8px; }
  .bracket.tr { top: 8px; right: 8px; }
  .bracket.bl { bottom: 52px; left: 8px; }
  .bracket.br { bottom: 52px; right: 8px; }

  .bracket.tl::before, .bracket.tr::before { top: 0; height: 2px; width: 100%; }
  .bracket.bl::before, .bracket.br::before { bottom: 0; height: 2px; width: 100%; }
  .bracket.tl::after,  .bracket.bl::after  { left: 0; width: 2px; height: 100%; }
  .bracket.tr::after,  .bracket.br::after  { right: 0; width: 2px; height: 100%; }

  body.connected .bracket::before,
  body.connected .bracket::after {
    background: var(--amber);
    box-shadow: 0 0 6px var(--amber-glow);
  }

  #terminal { width: 100%; height: 100%; }

  /* ── Status bar ── */
  #statusbar {
    background: var(--panel);
    border-top: 1px solid var(--border);
    padding: 0 20px;
    display: flex;
    align-items: center;
    gap: 20px;
    font-family: 'Share Tech Mono', monospace;
    font-size: 11px;
    color: var(--amber-dim);
    position: relative;
    z-index: 10;
  }

  #statusbar::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 1px;
    background: linear-gradient(90deg,
      transparent, var(--amber-dim), var(--amber), var(--amber-dim), transparent
    );
    box-shadow: 0 0 8px var(--amber-glow);
  }

  .key-badge {
    background: rgba(255,176,0,0.08);
    border: 1px solid var(--border);
    color: var(--amber);
    padding: 1px 5px;
    border-radius: 2px;
    font-size: 10px;
    margin-right: 3px;
  }

  #conn-status {
    margin-left: auto;
    display: flex;
    align-items: center;
    font-weight: bold;
    transition: color 0.3s;
  }
  #conn-status.ok     { color: var(--green-led); text-shadow: 0 0 8px rgba(57,255,20,0.5); }
  #conn-status.error  { color: var(--red-led);   text-shadow: 0 0 8px rgba(255,49,49,0.5); }

  /* ── Loading overlay ── */
  #loading {
    position: fixed; inset: 0;
    background: var(--bg);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 24px;
    z-index: 300;
    transition: opacity 0.6s;
  }
  #loading.hidden { opacity: 0; pointer-events: none; }

  .load-ring {
    width: 60px; height: 60px;
    border: 2px solid var(--border);
    border-top-color: var(--amber);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    box-shadow: 0 0 12px var(--amber-glow);
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .load-text {
    font-family: 'Share Tech Mono', monospace;
    font-size: 12px;
    color: var(--amber-dim);
    letter-spacing: 0.2em;
    text-transform: uppercase;
  }

  .scan-line-anim {
    width: 200px; height: 2px;
    background: linear-gradient(90deg, transparent, var(--amber), transparent);
    animation: scan-h 1.5s ease-in-out infinite;
  }
  @keyframes scan-h {
    0%   { transform: translateX(-200px); opacity: 0; }
    50%  { opacity: 1; }
    100% { transform: translateX(200px); opacity: 0; }
  }

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
</style>
</head>
<body>

<!-- Loading overlay -->
<div id="loading">
  <div class="load-ring"></div>
  <div class="scan-line-anim"></div>
  <div class="load-text">Initializing Terminal</div>
</div>

<div id="app">
  <!-- Header -->
  <div id="header">
    <span class="header-corner">◂ SYS-001 ▸</span>
    <div id="header-title">
      <h1>Career Pipeline</h1>
      <span>Mission Control Terminal</span>
    </div>
    <span id="conn-led" class="led red"></span>
  </div>

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

  <!-- Terminal viewport -->
  <div id="terminal-wrap">
    <div class="bracket tl"></div>
    <div class="bracket tr"></div>
    <div class="bracket bl"></div>
    <div class="bracket br"></div>
    <div id="terminal"></div>
  </div>

  <!-- Status bar -->
  <div id="statusbar">
    <span><span class="key-badge">↑↓</span> navigate</span>
    <span><span class="key-badge">j/k</span> cursor</span>
    <span><span class="key-badge">Enter</span> open</span>
    <span><span class="key-badge">Tab</span> views</span>
    <span><span class="key-badge">s</span> sort</span>
    <span><span class="key-badge">r</span> refresh</span>
    <span><span class="key-badge">p</span> progress</span>
    <span><span class="key-badge">q</span> quit</span>
    <span><span class="key-badge">o</span> open URL</span>
    <span><span class="key-badge">c</span> status</span>
    <span><span class="key-badge">f</span> filter</span>
    <span id="conn-status" class="error">○ Disconnected</span>
  </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/xterm-addon-web-links@0.9.0/lib/xterm-addon-web-links.min.js"></script>
<script>
(function() {
  // ── CRT amber theme for xterm ──
  const term = new Terminal({
    theme: {
      background: '#050a05',
      foreground: '#ffb000',
      black:   '#1a2e1a',
      red:     '#ff6b6b',
      green:   '#39ff14',
      yellow:  '#ffd93d',
      blue:    '#4d9fff',
      magenta: '#ff79c6',
      cyan:    '#00d4aa',
      white:   '#e0e0e0',
      brightBlack:   '#2d4a2d',
      brightRed:     '#ff8787',
      brightGreen:   '#6fff6f',
      brightYellow:   '#ffe066',
      brightBlue:    '#79b8ff',
      brightMagenta: '#ffa0c8',
      brightCyan:    '#00ffcc',
      brightWhite:   '#ffffff',
      cursor: '#ffb000',
      cursorAccent: '#050a05',
      selectionBackground: 'rgba(255,176,0,0.25)',
    },
    fontFamily: '"Share Tech Mono", "JetBrains Mono", "Fira Code", Consolas, monospace',
    fontSize: 13,
    lineHeight: 1.25,
    letterSpacing: 0.5,
    cursorBlink: true,
    cursorStyle: 'block',
    scrollback: 10000,
    allowProposedApi: true,
  });

  const fitAddon = new FitAddon.FitAddon();
  term.loadAddon(fitAddon);
  term.loadAddon(new WebLinksAddon.WebLinksAddon());

  const terminal = document.getElementById('terminal');
  term.open(terminal);
  fitAddon.fit();

  // Auto-resize on window changes
  const ro = new ResizeObserver(() => { try { fitAddon.fit(); } catch(e) {} });
  ro.observe(document.body);

  // ── WebSocket connection ──
  let ws = null;
  const status    = document.getElementById('conn-status');
  const connLed   = document.getElementById('conn-led');
  const loading   = document.getElementById('loading');

  function setStatus(text, cls, ledColor) {
    status.textContent = text;
    status.className = cls;
    connLed.className = 'led ' + ledColor;
  }

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
})();
</script>
</body>
</html>`
