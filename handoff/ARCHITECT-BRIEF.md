# Architect Brief
*Arch → Bob*

---

## Step 1 — Cleanup: remove dead dependency, add word script, hard-error on non-Windows

### Context
- `html-to-docx` was installed but immediately superseded by Word COM in `generate-word.mjs`. Unused.
- `generate-word.mjs` has no `npm run word` shortcut while `generate-pdf.mjs` has `npm run pdf`.
- Word COM is Windows-only. Non-Windows currently fails with a confusing spawn error. Owner wants a hard error with a clear message.

### Decisions
- Remove `html-to-docx` from package.json and uninstall from node_modules
- Add `"word": "node generate-word.mjs"` to package.json scripts after the `pdf` line
- Platform guard: if `process.platform !== 'win32'`, print clear error and exit 1

### Build Order
1. `npm uninstall html-to-docx` from `C:\career-ops` (not the worktree)
2. Remove `html-to-docx` line from `package.json` dependencies if not already removed by uninstall
3. Add `"word"` script to `package.json` scripts block
4. Insert platform guard into `generate-word.mjs` after the args validation block

### Flags
- Flag: `npm uninstall` must run from `C:\career-ops`, not the worktree
- Flag: do not touch `generate-pdf.mjs` in this step
- Flag: do not change the Word COM logic — surgical insert only for platform guard
- Flag: platform guard error message must be: `❌ generate-word.mjs requires Windows with Microsoft Word installed.\n   On macOS/Linux, use generate-pdf.mjs instead.`

### Definition of Done
- [ ] `html-to-docx` absent from `package.json` dependencies
- [ ] `html-to-docx` absent from `node_modules`
- [ ] `npm run word` exists in `package.json` scripts
- [ ] Running `generate-word.mjs` on non-Windows prints the specified error and exits 1
- [ ] `node test-all.mjs` passes (no new failures)

---

## Step 2 — Test suite: cover `lib/` in syntax checks

### Context
- `test-all.mjs` section 1 scans only root-level `.mjs` files via `readdirSync(ROOT)`.
- `lib/ats-normalize.mjs` is never syntax-checked. Both generators depend on it.

### Decisions
- Add a second loop after the existing root-level loop that checks all `.mjs` files in `lib/`
- Guard with `existsSync(join(ROOT, 'lib'))` so fresh clones don't break
- Label output as `lib/${f} syntax OK` / `lib/${f} has syntax errors`

### Build Order
1. Locate the syntax check block in `test-all.mjs` (section 1)
2. Insert `lib/` loop immediately after the existing root-level loop, before section 2

### Flags
- Flag: only touch section 1 — do not alter any other test section
- Flag: use same `run('node', ['--check', ...])` pattern already in the file

### Definition of Done
- [ ] `lib/ats-normalize.mjs` appears in `node test-all.mjs` output as a syntax-checked file
- [ ] No other test sections changed
- [ ] `node test-all.mjs` passes

---

## Step 3 — Consistency: fix temp HTML path in usage comment

### Context
- `generate-pdf.mjs` line 7 usage comment shows `/tmp/cv-...html` — `/tmp/` doesn't exist on Windows.
- `modes/pdf.md` already correctly says to write to project root as `cv-{candidate}-{company}-temp.html`.

### Decisions
- Fix the usage comment in `generate-pdf.mjs` line 7 only — one line, no logic changes

### Build Order
1. Edit `generate-pdf.mjs` line 7: replace `/tmp/cv-{candidate}-{company}.html` with `cv-{candidate}-{company}-temp.html`

### Flags
- Flag: do not touch `modes/pdf.md` — already correct
- Flag: comment change only — no logic

### Definition of Done
- [ ] Line 7 of `generate-pdf.mjs` shows `cv-{candidate}-{company}-temp.html`
- [ ] No other lines changed in the file
