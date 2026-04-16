# Web Terminal Fallback + Minimal Controls — Design Spec

## Data: 2026-04-16
## Status: approved
## Loadout: A (minimal rapido)

---

## 1. Problema

Quando PTY indisponivel (Windows), o servidor:
1. Envia mensagem de erro via WebSocket
2. Fecha a conexao imediatamente (`conn.Close()`)
3. Cliente reconnecta em loop — overlay nunca desaparece
4. A mensagem de erro usa quebras de linha `\r\n` sem ANSI, xterm.js interpreta literalmente

---

## 2. Solucao

### 2.1 Server-side (web.go)

**Mock PTY bridge para Windows:**
O `pty_bridge_windows.go` ja tem todos os metodos returning error. O `web.go` tambem ja tem a variavel `bridge` que pode ser `nil` ou ter `ptyFile == nil`.

**Mudancas em `handleWebSocket`:**
- Nao fazer `conn.Close()` imediatamente quando PTY indisponivel
- Enviar mensagem de erro em texto plano
- Enviar JSON status `{"type":"pty_unavailable"}` para cliente saber o estado
- Manter conexao aberta (para cliente poder reagir)

**HTTP `/health`:**
- Ja retorna 503 quando PTY indisponivel — nao precisa mudanca

### 2.2 Client-side (JavaScript)

**Antes de conectar WebSocket:**
1. Fazer `fetch('/health')`
2. Se 503: modo fallback
3. Se 200: modo normal

**Fallback mode:**
1. Esconder overlay (`loading.classList.add('hidden')`)
2. Escrever erro no terminal via `term.write()`
3. Mostrar control bar HTML (nao tenta conectar WS)

**Normal mode:**
1. Conectar WebSocket
2. `ws.onopen`: esconde overlay, boot banner
3. `ws.onclose`: reconnection loop (comportamento atual)

### 2.3 Control Bar (HTML + CSS)

Adicionar abaixo do header:

```html
<div id="controls" class="hidden">
  <button data-key="j" title="Move down (j)">▼ j</button>
  <button data-key="k" title="Move up (k)">▲ k</button>
  <button data-key="Enter" title="Open selected (Enter)">↵ Enter</button>
  <button data-key="r" title="Refresh (r)">↻ r</button>
  <button data-key="f" title="Filter (f)">⚡ f</button>
  <button data-key="p" title="Progress (p)">◐ p</button>
  <button data-key="o" title="Open URL (o)">🔗 o</button>
  <button data-key="q" title="Quit (q)">✕ q</button>
</div>
```

Estilo:
- Botoes estilo amber LED (transparente com border amber)
- Hover: glow effect
- Click: envia a tecla para o terminal (simula keypress)
- `#controls.hidden { display: none; }` — visivel apenas em fallback mode

### 2.4 Error message no terminal

Quando PTY indisponivel, escrever:

```
\x1b[2J\x1b[H
\x1b[1;33m╔══════════════════════════════════════════════════════════╗\x1b[0m\r\n
\x1b[1;33m║        CAREER PIPELINE — MISSION CONTROL              ║\x1b[0m\r\n
\x1b[1;33m╚══════════════════════════════════════════════════════════╝\x1b[0m\r\n
\x1b[0m\x1b[1;31m[PTY UNAVAILABLE]\x1b[0m\r\n\r\n
\x1b[0;33mThis web terminal requires Linux/macOS.\x1b[0m\r\n
\x1b[0;33mRun the TUI locally: go run main.go -path ..\x1b[0m\r\n\r\n
\x1b[0;2mUse the control bar above to navigate.\x1b[0m\r\n
```

---

## 3. Arquitectura de estados

```
User opens page
       ↓
fetch /health
       ↓
  ┌────┴────┐
  ↓         ↓
 503       200
  ↓         ↓
Fallback   Normal
Mode      Mode
  ↓         ↓
Hide      Connect
overlay   WS
  ↓         ↓
Write     ws.onopen:
error     hide overlay
  ↓       boot banner
Show      ↓
controls  normal
bar       terminal
```

---

## 4. Ficheiros a alterar

| Ficheiro | Mudanca |
|----------|---------|
| `dashboard/web/web.go` | Nao fechar conexao imediatamente no fallback; enviar JSON status; Control bar HTML |
| CSS embedded | Estilos para `#controls` e botoes |

---

## 5. Nao inclui (scope creep prevention)

- Named pipes para Windows como fallback de PTY
- Multi-sessao
- Scrollback configuravel
- Reconnect automatico no fallback mode
- WebSocket direto sem PTY
