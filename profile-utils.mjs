#!/usr/bin/env node
/**
 * profile-utils.mjs — small shared readers for config/profile.yml (#1897)
 *
 * The headless eval engines (gemini/openai/ollama/openrouter) each assemble a
 * system prompt from the same modes but never honored `language.output`, so a
 * user with `language: { output: de }` still got English reports from the budget
 * path (and gemini-eval hardcoded "in English, unless the JD is in another
 * language" — the JD-language detection AGENTS.md says must NEVER override the
 * explicit user preference). This centralizes the language resolution + the
 * canonical directive so all four engines agree and can't drift.
 *
 * Pure + js-yaml only, so it's unit-testable without any model/network.
 */
import { readFileSync, existsSync } from 'fs';
import yaml from 'js-yaml';

/**
 * Resolve the human-facing output language from a profile file. Missing file,
 * absent `language.output`, non-string value, or bad YAML → 'en' (the documented
 * default). Never throws.
 * @param {string} [profilePath]
 * @returns {string} an ISO-ish language code, e.g. 'en', 'de', 'ja'
 */
export function resolveOutputLanguage(profilePath = 'config/profile.yml') {
  try {
    if (!existsSync(profilePath)) return 'en';
    const raw = yaml.load(readFileSync(profilePath, 'utf-8')) || {};
    const v = raw?.language?.output;
    return typeof v === 'string' && v.trim() ? v.trim() : 'en';
  } catch {
    return 'en';
  }
}

/**
 * The canonical output-language directive (mirrors AGENTS.md's "Agent rule").
 * Injected into every headless engine's system prompt so human-facing output
 * follows `language.output`, not the JD's language.
 * @param {string} [lang]
 * @returns {string}
 */
export function outputLanguageDirective(lang = 'en') {
  return [
    `OUTPUT LANGUAGE: Write all human-facing output — the full A–G evaluation and`,
    `the machine-readable summary's free-text fields — in ${lang}, regardless of the`,
    `language of these instructions or of the job description. Keep market-specific`,
    `terms where relevant, but explain them in ${lang} when needed. The candidate's`,
    `configured language.output always wins over the JD's language.`,
  ].join(' ');
}
