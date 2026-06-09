# career-ops

One-command installer for [**career-ops**](https://github.com/santifer/career-ops) — the AI-powered job search pipeline built on Claude Code.

```bash
npx career-ops init
```

This scaffolds a ready-to-use workspace:

1. Clones career-ops at the latest stable release
2. Installs dependencies
3. Creates your config files (`config/profile.yml`, `portals.yml`, `cv.md`) — **without overwriting anything you've already set up**

Then open your AI coding tool in the folder and paste a job offer. career-ops is AI-agnostic — Claude Code, Gemini, Codex, Qwen, OpenCode and GitHub Copilot CLI all work.

## Usage

```bash
npx career-ops init [folder]   # default folder: ./career-ops
```

Prefer the manual route? `git clone` still works exactly as before — see the [setup guide](https://github.com/santifer/career-ops/blob/main/docs/SETUP.md).

## Requirements

- Node.js 18+
- git

## License

MIT © [Santiago Fernández de Valderrama](https://santifer.io)
