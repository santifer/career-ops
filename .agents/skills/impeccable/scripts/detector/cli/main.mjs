import fs from 'node:fs';
import path from 'node:path';

import { createBrowserDetector, detectUrl } from '../engines/browser/detect-url.mjs';
import { detectHtml } from '../engines/static-html/detect-html.mjs';
import { detectText } from '../engines/regex/detect-text.mjs';
import {
  HTML_EXTENSIONS,
  buildImportGraph,
  detectFrameworkConfig,
  isPortListening,
  walkDir,
} from '../node/file-system.mjs';

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

function formatFindings(findings, jsonMode) {
  if (jsonMode) return JSON.stringify(findings, null, 2);

  const grouped = {};
  for (const f of findings) {
    if (!grouped[f.file]) grouped[f.file] = [];
    grouped[f.file].push(f);
  }
  const out = [];
  for (const [file, items] of Object.entries(grouped)) {
    const importNote = items[0]?.importedBy?.length ? ` (imported by ${items[0].importedBy.join(', ')})` : '';
    out.push(`\n${file}${importNote}`);
    for (const item of items) {
      out.push(`  ${item.line ? `line ${item.line}: ` : ''}[${item.antipattern}] ${item.snippet}`);
      out.push(`    → ${item.description}`);
    }
  }
  out.push(`\n${findings.length} anti-pattern${findings.length === 1 ? '' : 's'} found.`);
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// Stdin handling
// ---------------------------------------------------------------------------

async function handleStdin(options = {}) {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const input = Buffer.concat(chunks).toString('utf-8');
  try {
    const parsed = JSON.parse(input);
    const fp = parsed?.tool_input?.file_path;
    if (fp && fs.existsSync(fp)) {
      return HTML_EXTENSIONS.has(path.extname(fp).toLowerCase())
        ? detectHtml(fp, options) : detectText(fs.readFileSync(fp, 'utf-8'), fp, options);
    }
  } catch { /* not JSON */ }
  return detectText(input, '<stdin>', options);
}


// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function confirm(question) {
  const rl = (await import('node:readline')).default.createInterface({
    input: process.stdin, output: process.stderr,
  });
  return new Promise((resolve) => {
    rl.question(`${question} [Y/n] `, (answer) => {
      rl.close();
      resolve(!answer || /^y(es)?$/i.test(answer.trim()));
    });
  });
}

function printUsage() {
  console.log(`Usage: impeccable detect [options] [file-or-dir-or-url...]

Scan files or URLs for UI anti-patterns and design quality issues.

Options:
  --json    Output results as JSON
  --gpt     Also report GPT-specific provider tells (off by default)
  --gemini  Also report Gemini-specific provider tells (off by default)
  --help    Show this help message

Detection modes:
  HTML files     Static HTML/CSS analysis (default, catches linked CSS)
  Non-HTML files Regex pattern matching (CSS, JSX, TSX, etc.)
  URLs           Puppeteer full browser rendering (auto-detected)

Examples:
  impeccable detect src/
  impeccable detect index.html
  impeccable detect https://example.com
  impeccable detect --json .`);
}

async function detectCli() {
  let args = process.argv.slice(2).map(arg => {
    if (arg === '-json') return '--json';
    if (arg === '-fast') return '--fast';
    return arg;
  });
  if (args[0] === 'detect') args = args.slice(1);
  const jsonMode = args.includes('--json');
  const helpMode = args.includes('--help');
  // --fast (regex-only) is deprecated: since the jsdom removal, the static
  // HTML/CSS analysis is fast and covers every rule, so the regex-only path
  // only loses coverage for no real speed win. Accept the flag for back-compat
  // but ignore it and run the full scan.
  if (args.includes('--fast')) {
    process.stderr.write(
      'Note: --fast is deprecated and ignored. The full scan is fast now and runs every rule.\n',
    );
  }
  const providers = [];
  if (args.includes('--gpt')) providers.push('gpt');
  if (args.includes('--gemini')) providers.push('gemini');
  const scanOptions = { providers };
  const targets = args.filter(a => !a.startsWith('--'));

  if (helpMode) { printUsage(); process.exit(0); }

  let allFindings = [];

  if (!process.stdin.isTTY && targets.length === 0) {
    allFindings = await handleStdin(scanOptions);
  } else {
    const paths = targets.length > 0 ? targets : [process.cwd()];
    const urlTargetCount = paths.filter(target => /^https?:\/\//i.test(target)).length;
    const browserDetector = urlTargetCount > 1 ? await createBrowserDetector() : null;

    try {
      for (const target of paths) {
        if (/^https?:\/\//i.test(target)) {
          try {
            const scanner = browserDetector
              ? (url) => browserDetector.detectUrl(url, scanOptions)
              : (url) => detectUrl(url, scanOptions);
            allFindings.push(...await scanner(target));
          } catch (e) { process.stderr.write(`Error: ${e.message}\n`); }
          continue;
        }

        const resolved = path.resolve(target);
        let stat;
        try { stat = fs.statSync(resolved); }
        catch { process.stderr.write(`Warning: cannot access ${target}\n`); continue; }

        if (stat.isDirectory()) {
          // Check for framework dev server config (skip in JSON mode to avoid polluting output)
          if (!jsonMode) {
            const fwConfig = detectFrameworkConfig(resolved);
            if (fwConfig) {
              const probe = await isPortListening(fwConfig.port, fwConfig.fingerprint);
              if (probe.listening && probe.matched) {
                process.stderr.write(
                  `\n${fwConfig.name} dev server detected on localhost:${fwConfig.port}.\n` +
                  `For more accurate results, scan the running site:\n` +
                  `  npx impeccable detect http://localhost:${fwConfig.port}\n\n`
                );
              } else if (probe.listening && !probe.matched) {
                process.stderr.write(
                  `\n${fwConfig.name} project detected (${path.basename(fwConfig.configPath)}).\n` +
                  `Port ${fwConfig.port} is in use by another service. Start the ${fwConfig.name} dev server and scan via URL for best results.\n\n`
                );
              } else {
                process.stderr.write(
                  `\n${fwConfig.name} project detected (${path.basename(fwConfig.configPath)}).\n` +
                  `Start the dev server and scan via URL for best results:\n` +
                  `  npx impeccable detect http://localhost:${fwConfig.port}\n\n`
                );
              }
            }
          }

          const files = walkDir(resolved);
          const htmlCount = files.filter(f => HTML_EXTENSIONS.has(path.extname(f).toLowerCase())).length;

          // Warn and confirm if scanning many files (static HTML/CSS processes each HTML file)
          if (files.length > 50 && process.stdin.isTTY && !jsonMode) {
            process.stderr.write(
              `\nFound ${files.length} files (${htmlCount} HTML) in ${target}.\n` +
              `Scanning may take a while${htmlCount > 10 ? ' (static HTML/CSS processes each HTML file individually)' : ''}.\n` +
              `Target a specific subdirectory to narrow scope.\n`
            );
            const ok = await confirm('Continue?');
            if (!ok) { process.stderr.write('Aborted.\n'); process.exit(0); }
          }

          // Build import graph for multi-file awareness
          const graph = buildImportGraph(files);
          // Build reverse map: file -> set of files that import it
          const importedByMap = new Map();
          for (const [importer, imports] of graph) {
            for (const imported of imports) {
              if (!importedByMap.has(imported)) importedByMap.set(imported, new Set());
              importedByMap.get(imported).add(importer);
            }
          }

          for (const file of files) {
            const ext = path.extname(file).toLowerCase();
            let fileFindings;
            if (HTML_EXTENSIONS.has(ext)) {
              fileFindings = await detectHtml(file, scanOptions);
            } else {
              fileFindings = detectText(fs.readFileSync(file, 'utf-8'), file, scanOptions);
            }
            // Annotate findings with import context
            const importers = importedByMap.get(file);
            if (importers && importers.size > 0) {
              const importerNames = [...importers].map(f => path.basename(f));
              for (const f of fileFindings) {
                f.importedBy = importerNames;
              }
            }
            allFindings.push(...fileFindings);
          }
        } else if (stat.isFile()) {
          const ext = path.extname(resolved).toLowerCase();
          if (HTML_EXTENSIONS.has(ext)) {
            allFindings.push(...await detectHtml(resolved, scanOptions));
          } else {
            allFindings.push(...detectText(fs.readFileSync(resolved, 'utf-8'), resolved, scanOptions));
          }
        }
      }
    } finally {
      if (browserDetector) await browserDetector.close();
    }
  }

  if (allFindings.length > 0) {
    if (jsonMode) process.stdout.write(formatFindings(allFindings, true) + '\n');
    else process.stderr.write(formatFindings(allFindings, false) + '\n');
    process.exit(2);
  }
  if (jsonMode) process.stdout.write('[]\n');
  process.exit(0);
}

export { formatFindings, handleStdin, confirm, printUsage, detectCli };
