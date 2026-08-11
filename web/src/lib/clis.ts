import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Server-only (node imports). The agnostic runtimes career-ops can delegate to
// in headless mode (AGENTS.md). Install URLs from career-ops-docs.
export type CliSpec = {
  id: string;
  name: string;
  bin: string;
  run: string;
  url: string;
  /** headless invocation args for a single prompt */
  args: (prompt: string) => string[];
  /**
   * Args that ask for a structured event stream instead of plain text. Present
   * only for CLIs cli-stream.mjs can parse; without it the route falls back to
   * raw stdout, which displays fine but reports no token usage.
   */
  streamArgs?: (prompt: string) => string[];
  /**
   * stderr lines that are noise, not failure. The route treats any stderr
   * matching /error|denied|auth|.../ as a real error — deliberately broad,
   * because a silent auth failure is the worst outcome. Codex logs a benign
   * `ERROR codex_models_manager::cache: failed to load models cache` on every
   * run, which that rule reads as a failed run.
   */
  benignStderr?: RegExp;
};

export const KNOWN: CliSpec[] = [
  { id: "claude", name: "Claude Code", bin: "claude", run: "claude -p", url: "https://claude.ai/code", args: (p) => ["-p", p],
    streamArgs: (p) => ["-p", p, "--output-format", "stream-json", "--verbose", "--include-partial-messages"] },
  { id: "codex", name: "Codex", bin: "codex", run: "codex exec", url: "https://github.com/openai/codex", args: (p) => ["exec", p],
    streamArgs: (p) => ["exec", "--json", p],
    benignStderr: /models cache|base_instructions/i },
  { id: "gemini", name: "Gemini CLI", bin: "gemini", run: "gemini -p", url: "https://github.com/google-gemini/gemini-cli", args: (p) => ["-p", p] },
  { id: "opencode", name: "OpenCode", bin: "opencode", run: "opencode run", url: "https://opencode.ai", args: (p) => ["run", p] },
  { id: "copilot", name: "GitHub Copilot CLI", bin: "copilot", run: "copilot -p", url: "https://docs.github.com/en/copilot/github-copilot-in-the-cli", args: (p) => ["-p", p] },
  { id: "qwen", name: "Qwen CLI", bin: "qwen", run: "qwen -p", url: "https://qwen.ai/qwencode", args: (p) => ["-p", p] },
  { id: "antigravity", name: "Antigravity CLI", bin: "agy", run: "agy -p", url: "https://antigravity.google", args: (p) => ["-p", p] },
  { id: "grok", name: "Grok Build CLI", bin: "grok", run: "grok -p", url: "https://docs.x.ai/build/overview", args: (p) => ["-p", p],
    streamArgs: (p) => ["-p", p, "--output-format", "streaming-json"] },
];

function searchDirs(): string[] {
  const home = os.homedir();
  const extra = [
    path.join(home, ".local/bin"),
    path.join(home, ".npm-global/bin"),
    path.join(home, ".bun/bin"),
    path.join(home, ".deno/bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
  ];
  if (process.platform === "win32") {
    // Windows CLIs frequently install under per-user AppData roots and don't
    // reliably add themselves to PATH (e.g. Antigravity → %LOCALAPPDATA%\agy\bin).
    const localAppData = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
    const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    extra.push(
      path.join(localAppData, "agy", "bin"), // Antigravity CLI
      path.join(localAppData, "Microsoft", "WindowsApps"), // winget/Store shims
      path.join(appData, "npm"), // npm global prefix on Windows
    );
  }
  const fromPath = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  return [...new Set([...fromPath, ...extra])];
}

// On Windows, executables carry an extension (claude.exe, claude.cmd, ...).
// Mirror the shell's PATHEXT resolution so a native-installer claude.exe is
// found, not just an extensionless npm shim. On POSIX, "" keeps the bare name.
function binCandidates(bin: string): string[] {
  if (process.platform !== "win32") return [bin];
  const pathext = process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD";
  const exts = pathext
    .split(";")
    .map((e) => e.trim())
    .filter(Boolean)
    // Only include extensions that `child_process.spawn()` can execute directly.
    .filter((e) => [".com", ".exe", ".bat", ".cmd"].includes(e.toLowerCase()));

  // Try the bare name too (some environments provide an extensionless shim).
  return [bin, ...exts.map((ext) => bin + ext)];
}

export function findBin(bin: string, dirs = searchDirs()): string | null {
  for (const dir of dirs) {
    for (const candidate of binCandidates(bin)) {
      const p = path.join(dir, candidate);
      try {
        fs.accessSync(p, fs.constants.X_OK);
        return p;
      } catch {
        /* not here */
      }
    }
  }
  return null;
}

export function detectClis() {
  const dirs = searchDirs();
  return KNOWN.map((c) => {
    const found = findBin(c.bin, dirs);
    return { id: c.id, name: c.name, run: c.run, url: c.url, installed: !!found, path: found };
  });
}

export function resolveCli(id: string): { spec: CliSpec; binPath: string } | null {
  const spec = KNOWN.find((c) => c.id === id);
  if (!spec) return null;
  const binPath = findBin(spec.bin);
  if (!binPath) return null;
  return { spec, binPath };
}
