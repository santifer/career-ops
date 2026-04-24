"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var overlay_exports = {};
__export(overlay_exports, {
  Overlay: () => Overlay
});
module.exports = __toCommonJS(overlay_exports);
var import_utils = require("../utils");
var import_page = require("./page");
class Overlay {
  constructor(page) {
    this._overlays = /* @__PURE__ */ new Map();
    this._page = page;
    this._page.on(import_page.Page.Events.InternalFrameNavigatedToNewDocument, (frame) => {
      if (frame.parentFrame())
        return;
      for (const [id, html] of this._overlays)
        this._doAdd(id, html).catch((e) => import_utils.debugLogger.log("error", e));
    });
  }
  dispose() {
  }
  async show(html, duration) {
    const id = (0, import_utils.createGuid)();
    this._overlays.set(id, html);
    await this._doAdd(id, html).catch((e) => import_utils.debugLogger.log("error", e));
    if (duration) {
      await new Promise((f) => setTimeout(f, duration));
      await this.remove(id);
    }
    return id;
  }
  async _doAdd(id, html) {
    const utility = await this._page.mainFrame()._utilityContext();
    await utility.evaluate(({ injected, html: html2, id: id2 }) => {
      return injected.addUserOverlay(id2, html2);
    }, { injected: await utility.injectedScript(), html, id });
  }
  async remove(id) {
    this._overlays.delete(id);
    const utility = await this._page.mainFrame()._utilityContext();
    await utility.evaluate(({ injected, id: id2 }) => {
      injected.removeUserOverlay(id2);
    }, { injected: await utility.injectedScript(), id }).catch((e) => import_utils.debugLogger.log("error", e));
  }
  async chapter(options) {
    const fadeDuration = 300;
    const descriptionHtml = options.description ? `<div id="description">${(0, import_utils.escapeHTML)(options.description)}</div>` : "";
    const styleSheet = `
      @keyframes pw-chapter-fade-in {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes pw-chapter-fade-out {
        from { opacity: 1; }
        to { opacity: 0; }
      }
      #background {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        backdrop-filter: blur(2px);
        animation: pw-chapter-fade-in ${fadeDuration}ms ease-out forwards;
      }
      #background.fade-out {
        animation: pw-chapter-fade-out ${fadeDuration}ms ease-in forwards;
      }
      #content {
        background: rgba(0, 0, 0, 0.7);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 16px;
        padding: 40px 56px;
        max-width: 560px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      }
      #title {
        color: white;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 28px;
        font-weight: 600;
        line-height: 1.3;
        text-align: center;
        letter-spacing: -0.01em;
      }
      #description {
        color: rgba(255, 255, 255, 0.7);
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 15px;
        line-height: 1.5;
        margin-top: 12px;
        text-align: center;
      }
    `;
    const duration = options.duration ?? 2e3;
    const html = `<style>${styleSheet}</style><div id="background"><div id="content"><div id="title">${(0, import_utils.escapeHTML)(options.title)}</div>${descriptionHtml}</div></div>`;
    const id = await this.show(html);
    await new Promise((f) => setTimeout(f, duration));
    const utility = await this._page.mainFrame()._utilityContext();
    await utility.evaluate(({ injected, id: id2, fadeDuration: fadeDuration2 }) => {
      const overlay = injected.getUserOverlay(id2);
      const bg = overlay?.querySelector("#background");
      if (bg)
        bg.classList.add("fade-out");
      return new Promise((f) => injected.utils.builtins.setTimeout(f, fadeDuration2));
    }, { injected: await utility.injectedScript(), id, fadeDuration }).catch((e) => import_utils.debugLogger.log("error", e));
    await this.remove(id);
  }
  async setVisible(visible) {
    if (!this._overlays.size)
      return;
    const utility = await this._page.mainFrame()._utilityContext();
    await utility.evaluate(({ injected, visible: visible2 }) => {
      injected.setUserOverlaysVisible(visible2);
    }, { injected: await utility.injectedScript(), visible }).catch((e) => import_utils.debugLogger.log("error", e));
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Overlay
});
