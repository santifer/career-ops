/**
 * permission/index.ts — standalone page that requests host permissions.
 *
 * Runs as a regular extension page (chrome-extension://.../permission.html).
 * Loaded by background via handleOpenPermissionTab with ?origin= and ?label=
 * query params.
 *
 * Why a dedicated page: chrome.permissions.request requires a user
 * gesture in an extension UI context. The panel (content-script DOM)
 * does not qualify. The popup does, but feels hidden. A tab is always
 * reachable and gives us room to explain what we're asking for.
 *
 * Flow:
 *   1. Parse origin/label from URL.
 *   2. User clicks "Authorize" → chrome.permissions.request.
 *   3. On granted, broadcast { kind: "permissionGranted", origin }
 *      via chrome.runtime.sendMessage so any open panel auto-retries,
 *      then close this tab.
 *   4. On denied, stay open with a retry affordance.
 */

const params = new URLSearchParams(location.search);
const origin = params.get("origin") ?? "";
const label = params.get("label") ?? origin;

const labelEl = document.getElementById("label") as HTMLElement;
const originEl = document.getElementById("origin") as HTMLElement;
const grantBtn = document.getElementById("grant") as HTMLButtonElement;
const cancelBtn = document.getElementById("cancel") as HTMLButtonElement;
const statusEl = document.getElementById("status") as HTMLElement;

labelEl.textContent = label || "—";
originEl.textContent = origin || "—";

function setStatus(text: string, kind: "" | "error" | "success" = ""): void {
  statusEl.textContent = text;
  statusEl.className = `status${kind ? " " + kind : ""}`;
}

if (!origin) {
  grantBtn.disabled = true;
  setStatus("missing origin parameter", "error");
}

grantBtn.addEventListener("click", async () => {
  grantBtn.disabled = true;
  cancelBtn.disabled = true;
  setStatus("waiting for Chrome permission prompt…");

  let granted = false;
  try {
    granted = await chrome.permissions.request({ origins: [origin] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setStatus(`request failed: ${msg}`, "error");
    grantBtn.disabled = false;
    cancelBtn.disabled = false;
    return;
  }

  if (!granted) {
    setStatus("declined — you can retry or cancel", "error");
    grantBtn.disabled = false;
    cancelBtn.disabled = false;
    return;
  }

  setStatus("granted — resuming capture", "success");
  try {
    await chrome.runtime.sendMessage({ kind: "permissionGranted", origin });
  } catch {
    // receiver may be absent if panel closed; harmless
  }
  setTimeout(() => {
    const tabIdP = chrome.tabs?.getCurrent ? chrome.tabs.getCurrent() : null;
    if (tabIdP && typeof (tabIdP as Promise<chrome.tabs.Tab>).then === "function") {
      (tabIdP as Promise<chrome.tabs.Tab>).then((t) => {
        if (t?.id !== undefined) chrome.tabs.remove(t.id).catch(() => undefined);
      });
    } else {
      window.close();
    }
  }, 600);
});

cancelBtn.addEventListener("click", () => {
  const tabIdP = chrome.tabs?.getCurrent ? chrome.tabs.getCurrent() : null;
  if (tabIdP && typeof (tabIdP as Promise<chrome.tabs.Tab>).then === "function") {
    (tabIdP as Promise<chrome.tabs.Tab>).then((t) => {
      if (t?.id !== undefined) chrome.tabs.remove(t.id).catch(() => undefined);
    });
  } else {
    window.close();
  }
});
