/**
 * state.ts — chrome.storage.local wrapper for ExtensionState.
 *
 * Single source of persistence. The rest of the background worker
 * calls loadState()/saveState() and never touches chrome.storage directly.
 */

import type { ExtensionState } from "../contracts/messages.js";
import { STATE_STORAGE_KEY } from "../contracts/messages.js";

const DEFAULT_STATE: ExtensionState = {
  bridgeHost: "127.0.0.1",
  bridgePort: 47319,
  preferredBridgePreset: "real-codex",
  bridgeToken: "",
};

export async function loadState(): Promise<ExtensionState> {
  const stored = await chrome.storage.local.get(STATE_STORAGE_KEY);
  const raw = stored[STATE_STORAGE_KEY];
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_STATE };
  }
  // Merge with defaults so a partial stored state upgrades cleanly.
  return { ...DEFAULT_STATE, ...(raw as Partial<ExtensionState>) };
}

export async function saveState(state: ExtensionState): Promise<void> {
  await chrome.storage.local.set({ [STATE_STORAGE_KEY]: state });
}

export async function patchState(
  patch: Partial<ExtensionState>
): Promise<ExtensionState> {
  const current = await loadState();
  const next = { ...current, ...patch };
  await saveState(next);
  return next;
}
