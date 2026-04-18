# Extension Open Failure Investigation

## Background

The Chrome extension is expected to open an in-page career-ops panel from the toolbar action. The current manifest does not define a default popup; the background service worker injects `panel.js` into the active tab and sends a `togglePanel` message.

## Goal

Find and fix why the browser extension appears not to open even after the local extension and bridge workflow has been started.

## Scope

- Inspect the extension launch/open path: manifest, build output, background toolbar handler, panel injection, and relevant documentation.
- Verify build/typecheck behavior for the extension.
- Make the smallest repo change needed to surface or fix the failure.
- Do not alter bridge evaluation logic unless the open failure proves to depend on it.

## Assumptions

- The user is using Chrome or a Chromium browser with the unpacked extension loaded from `extension/dist`.
- "All started" means the bridge and/or launcher workflow ran, but the extension UI does not appear from the browser toolbar.
- Existing uncommitted changes in the worktree are user or prior-session changes and must not be reverted.

## Uncertainties

- Whether the loaded unpacked extension is pointing at the current `extension/dist`.
- Whether the user is clicking on a normal web page or a restricted page such as `chrome://extensions`.
- Whether Chrome reports a background service worker error that is currently swallowed by the extension code.

## Implementation Steps

1. Read extension docs, manifest, build script, background action handler, and panel code.
   Verify: identify the exact open path and likely failure points.
2. Run extension typecheck/build and inspect generated manifest.
   Verify: build succeeds and output matches the intended toolbar-panel behavior.
3. Reproduce or statically isolate the open failure.
   Verify: a failing command, browser-visible error path, or code path explains the symptom.
4. Apply the smallest fix.
   Verify: targeted tests/build pass and docs/plan record the result.

## Verification Approach

- `npm --prefix extension run typecheck`
- `npm --prefix extension run build`
- Additional targeted checks if the root cause involves generated artifacts or launch scripts.

## Progress Log

- 2026-04-17: Created plan after the user reported the extension still does not open in the browser.
- 2026-04-17: Confirmed from `docs/BROWSER_EXTENSION.md` and `extension/public/manifest.json` that the toolbar action is intended to inject an in-page panel, not open `popup.html`.
- 2026-04-17: Verified `npm --prefix extension run typecheck` passes using `/usr/local/bin/npm` because the Codex app shell did not expose `npm` on PATH.
- 2026-04-17: Verified `npm --prefix extension run build` passes and regenerates `extension/dist`.
- 2026-04-17: Isolated a silent runtime failure path: the toolbar action swallowed `chrome.scripting.executeScript` failures, so clicking on restricted pages such as `chrome://extensions` could appear to do nothing.
- 2026-04-17: Updated the toolbar action to open a visible unsupported-page explanation when panel injection is impossible.
- 2026-04-17: Added `extension/public/unsupported.html` and `extension/public/unsupported.css`, copied them during the extension build, and documented that users must click the icon from a regular job page rather than `chrome://extensions`.
- 2026-04-17: Re-ran `npm --prefix extension run typecheck` and `npm --prefix extension run build` after moving the unsupported page styling into an external CSS file; both passed.
- 2026-04-17: User confirmed the issue still reproduced on `https://jobright.ai/jobs/info/...`, so the restricted-page hypothesis was insufficient.
- 2026-04-17: Removed the first-click dependency on a delayed `setTimeout` message from the MV3 background service worker. The panel content script now opens itself immediately on first injection and only uses runtime messages for later toggles.
- 2026-04-17: Added a small content-script bootstrap guard so repeated injection attempts toggle the existing panel without stacking duplicate runtime listeners.
- 2026-04-17: Re-ran `npm --prefix extension run typecheck` and `npm --prefix extension run build`; both passed, and generated `extension/dist/panel.js` contains the first-injection auto-open path.
- 2026-04-17: User provided bridge logs showing `/v1/health` and `/v1/tracker` requests immediately after click. That proves the panel script initializes, so the remaining failure is visibility rather than injection or bridge startup.
- 2026-04-17: Found saved panel position restore did not clamp to the current viewport. A panel dragged on another monitor or larger window could restore offscreen while still making bridge requests.
- 2026-04-17: Added viewport clamping on saved-position restore and whenever an existing panel is shown again.
- 2026-04-17: Re-ran `npm --prefix extension run typecheck` and `npm --prefix extension run build`; both passed, and `extension/dist/panel.js` grew to include the viewport clamp.
- 2026-04-17: User reported `Uncaught Error: Extension context invalidated` on `newgrad-jobs.com` after reload. Found stale injected panel code could still call `chrome.storage.local.set`, `chrome.storage.local.get`, `chrome.runtime.sendMessage`, `chrome.runtime.connect`, and `chrome.runtime.onMessage.addListener` after the extension context was invalidated.
- 2026-04-17: Added guarded runtime/storage wrappers so stale panels return a visible `EXTENSION_CONTEXT_INVALIDATED` error instead of throwing uncaught exceptions.
- 2026-04-17: Re-ran `npm --prefix extension run typecheck` and `npm --prefix extension run build`; both passed, and `extension/dist/panel.js` includes the guarded calls.

## Key Decisions

- Treat bridge health as secondary until the toolbar action can visibly open the extension panel.
- Preserve existing dirty worktree changes and avoid broad cleanup.
- Keep the existing in-page panel model instead of switching the manifest back to a default popup.

## Risks and Blockers

- Browser-only behavior may require manual Chrome reload/load-unpacked confirmation if local CLI checks pass.
- Restricted Chrome pages still cannot receive injected content scripts; the extension now opens an explanation page instead of failing silently.
- If Chrome is loading a different unpacked directory than `extension/dist`, local rebuilds will not affect the installed extension.
- A visible bridge request sequence does not prove the panel is on-screen; use viewport clamping and, if needed, clear `careerOps.panelPos`.
- Already-open web pages keep stale content-script contexts after Chrome extension reload; refresh the page once after reloading the unpacked extension.

## Final Outcome

Fixed toolbar injection timing, silent unsupported-page failures, offscreen saved-position restore, and stale-context uncaught exceptions after extension reload. Verified extension typecheck/build. The user still needs to reload the unpacked extension in Chrome and refresh already-open target pages so the rebuilt panel script replaces stale content-script contexts.
