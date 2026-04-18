/**
 * build.mjs — esbuild entrypoint for the career-ops Chrome extension.
 *
 * Bundles three entry points into dist/:
 *   • background.js  (service worker, ESM)
 *   • popup.js       (popup controller, ESM)
 *   • content.js     (injected content script, IIFE — self-contained)
 *
 * Copies:
 *   • public/manifest.json  → dist/manifest.json
 *   • public/popup.html     → dist/popup.html
 *   • public/popup.css      → dist/popup.css
 *
 * content.js is bundled as IIFE (not ESM) because it runs via
 * chrome.scripting.executeScript({ files: ["content.js"] }) in the
 * page's isolated world. The IIFE's return value is the capture result.
 */

import { build } from "esbuild";
import { mkdir, copyFile, rm, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "src");
const PUBLIC_DIR = join(__dirname, "public");
const DIST = join(__dirname, "dist");
const REPO_ROOT = join(__dirname, "..");

// Read VERSION from repo root for injection into extension code
let extensionVersion = "0.0.0";
try {
  extensionVersion = (await readFile(join(REPO_ROOT, "VERSION"), "utf-8")).trim();
} catch { /* fallback to 0.0.0 */ }

async function main() {
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  const sharedDefine = {
    __EXTENSION_VERSION__: JSON.stringify(extensionVersion),
  };

  // Background + popup + permission page: ESM modules
  await build({
    entryPoints: {
      background: join(SRC, "background/index.ts"),
      popup: join(SRC, "popup/index.ts"),
      permission: join(SRC, "permission/index.ts"),
    },
    bundle: true,
    format: "esm",
    target: "es2022",
    outdir: DIST,
    sourcemap: "linked",
    minify: false,
    logLevel: "info",
    define: sharedDefine,
  });

  // Panel content script: IIFE (injected into pages, must be self-contained)
  await build({
    entryPoints: {
      panel: join(SRC, "panel/inject.ts"),
      content: join(SRC, "content/extract.ts"),
    },
    bundle: true,
    format: "iife",
    target: "es2022",
    outdir: DIST,
    sourcemap: "linked",
    minify: false,
    logLevel: "info",
    define: sharedDefine,
  });

  // Copy static assets
  await copyFile(join(PUBLIC_DIR, "manifest.json"), join(DIST, "manifest.json"));
  await copyFile(join(PUBLIC_DIR, "popup.html"), join(DIST, "popup.html"));
  await copyFile(join(PUBLIC_DIR, "popup.css"), join(DIST, "popup.css"));
  await copyFile(join(PUBLIC_DIR, "permission.html"), join(DIST, "permission.html"));
  await copyFile(join(PUBLIC_DIR, "permission.css"), join(DIST, "permission.css"));
  await copyFile(join(PUBLIC_DIR, "unsupported.html"), join(DIST, "unsupported.html"));
  await copyFile(join(PUBLIC_DIR, "unsupported.css"), join(DIST, "unsupported.css"));

  console.log("\n✅ extension built → dist/");
  console.log("   Load in Chrome: chrome://extensions → 'Load unpacked' → select dist/");
}

main().catch((err) => {
  console.error("build failed:", err);
  process.exit(1);
});
