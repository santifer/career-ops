// tests/profile-utils.test.mjs — the shared language.output resolver (#1897) and
// a guard that all four headless eval engines actually use it (and gemini-eval
// no longer hardcodes the JD-language-detection policy AGENTS.md forbids).
import { pass, fail, ROOT } from './helpers.mjs';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';

console.log('\nprofile-utils.mjs (language.output, #1897)');

try {
  const { resolveOutputLanguage, outputLanguageDirective } = await import(pathToFileURL(join(ROOT, 'profile-utils.mjs')).href);

  const dir = mkdtempSync(join(tmpdir(), 'career-ops-lang-'));
  try {
    const write = (name, body) => { const p = join(dir, name); writeFileSync(p, body); return p; };
    if (resolveOutputLanguage(write('de.yml', 'language:\n  output: de\n')) === 'de') pass('resolveOutputLanguage reads language.output');
    else fail('resolveOutputLanguage should read de');
    if (resolveOutputLanguage(write('none.yml', 'candidate:\n  full_name: X\n')) === 'en') pass('resolveOutputLanguage defaults to en when language.output is absent');
    else fail('resolveOutputLanguage should default to en');
    if (resolveOutputLanguage(join(dir, 'missing.yml')) === 'en') pass('resolveOutputLanguage returns en for a missing profile');
    else fail('resolveOutputLanguage should return en for a missing file');
    if (resolveOutputLanguage(write('bad.yml', 'language:\n  output: [de\n')) === 'en') pass('resolveOutputLanguage falls back to en on malformed YAML');
    else fail('resolveOutputLanguage should fall back to en on bad YAML');
    if (resolveOutputLanguage(write('num.yml', 'language:\n  output: 42\n')) === 'en') pass('resolveOutputLanguage ignores a non-string language.output');
    else fail('resolveOutputLanguage should ignore a non-string value');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  // directive embeds the language and states the precedence rule
  const d = outputLanguageDirective('ja');
  if (d.includes('ja') && /language\.output always wins/i.test(d)) pass('outputLanguageDirective embeds the language and the precedence rule');
  else fail(`outputLanguageDirective => ${d}`);

  // Guard: every headless engine resolves + injects the directive, and gemini
  // no longer hardcodes "in English, unless the JD is in another language".
  const engines = ['gemini-eval.mjs', 'openai-eval.mjs', 'ollama-eval.mjs', 'openrouter-runner.mjs'];
  const missing = engines.filter((e) => {
    const src = readFileSync(join(ROOT, e), 'utf-8');
    return !(src.includes('resolveOutputLanguage') && src.includes('outputLanguageDirective'));
  });
  if (missing.length === 0) pass('all four headless engines resolve and inject language.output (#1897)');
  else fail(`engines missing language.output wiring: ${missing.join(', ')}`);

  if (!/in English, unless the JD is in another language/i.test(readFileSync(join(ROOT, 'gemini-eval.mjs'), 'utf-8'))) {
    pass('gemini-eval no longer hardcodes the JD-language-detection policy (#1897)');
  } else {
    fail('gemini-eval still hardcodes "in English, unless the JD is in another language"');
  }
} catch (e) {
  fail(`profile-utils tests crashed: ${e.message}`);
}
