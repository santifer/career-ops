import js from '@eslint/js';
import globals from 'globals';

// Flat config for career-ops. The project is plain ESM (.mjs) Node scripts with
// no build step. Lint the project's own source only — never vendored or
// generated trees (notably the Python venv under templates/firecrawl-agent).
export default [
  {
    ignores: [
      'node_modules/**',
      'templates/firecrawl-agent/**',
      'dashboard/**',
      'output/**',
      'tmp/**',
      'reports/**',
      'sajithkumarswaminathan-design/**',
      'scaffolder/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.mjs', '**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      // browser globals cover document/window used inside Playwright
      // page.evaluate() callbacks, which execute in the page context.
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      // Surface unused symbols without failing the build; allow intentional
      // throwaways prefixed with _ (matches existing catch (e) {} patterns).
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      // Empty catch blocks are a deliberate graceful-degradation pattern here.
      'no-empty': ['error', { allowEmptyCatch: true }],
      // generate-pdf.mjs masks text with \u0000 sentinels and strips zero-width
      // / control characters for ATS-safe PDFs — both are intentional.
      'no-control-regex': 'off',
      'no-misleading-character-class': 'off',
    },
  },
];
