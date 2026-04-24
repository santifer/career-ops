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
var screencast_exports = {};
__export(screencast_exports, {
  Screencast: () => Screencast
});
module.exports = __toCommonJS(screencast_exports);
var import_utils = require("../utils");
var import_utils2 = require("../utils");
class Screencast {
  constructor(page) {
    this._clients = /* @__PURE__ */ new Set();
    this.page = page;
    this.page.instrumentation.addListener(this, page.browserContext);
  }
  async handlePageOrContextClose() {
    const clients = [...this._clients];
    this._clients.clear();
    for (const client of clients) {
      if (client.gracefulClose)
        await client.gracefulClose();
    }
  }
  dispose() {
    for (const client of this._clients)
      client.dispose();
    this._clients.clear();
    this.page.instrumentation.removeListener(this);
  }
  showActions(options) {
    this._actions = options;
  }
  hideActions() {
    this._actions = void 0;
  }
  addClient(client) {
    this._clients.add(client);
    if (this._clients.size === 1)
      this._startScreencast(client.size, client.quality);
    return { size: this._size };
  }
  removeClient(client) {
    if (!this._clients.has(client))
      return;
    this._clients.delete(client);
    if (!this._clients.size)
      this._stopScreencast();
  }
  size() {
    return this._size;
  }
  _startScreencast(size, quality) {
    this._size = size;
    if (!this._size) {
      const viewport = this.page.browserContext._options.viewport || { width: 800, height: 600 };
      const scale = Math.min(1, 800 / Math.max(viewport.width, viewport.height));
      this._size = {
        width: Math.floor(viewport.width * scale),
        height: Math.floor(viewport.height * scale)
      };
    }
    this._size = {
      width: this._size.width & ~1,
      height: this._size.height & ~1
    };
    this.page.delegate.startScreencast({
      width: this._size.width,
      height: this._size.height,
      quality: quality ?? 90
    });
  }
  _stopScreencast() {
    this.page.delegate.stopScreencast();
  }
  onScreencastFrame(frame, ack) {
    const asyncResults = [];
    for (const client of this._clients) {
      const result = client.onFrame(frame);
      if (result)
        asyncResults.push(result);
    }
    if (ack) {
      if (!asyncResults.length)
        ack();
      else
        Promise.race(asyncResults).then(ack);
    }
  }
  async onBeforeCall(sdkObject, metadata, parentId) {
    if (!this._actions)
      return;
    metadata.annotate = true;
  }
  async onBeforeInputAction(sdkObject, metadata) {
    if (!this._actions)
      return;
    const page = sdkObject.attribution.page;
    if (!page)
      return;
    const actionTitle = (0, import_utils.renderTitleForCall)(metadata);
    const utility = await page.mainFrame()._utilityContext();
    await utility.evaluate(async (options) => {
      const { injected, duration } = options;
      injected.setScreencastAnnotation(options);
      await new Promise((f) => injected.utils.builtins.setTimeout(f, duration));
      injected.setScreencastAnnotation(null);
    }, {
      injected: await utility.injectedScript(),
      duration: this._actions?.duration ?? 500,
      point: metadata.point,
      box: metadata.box,
      actionTitle,
      position: this._actions?.position,
      fontSize: this._actions?.fontSize
    }).catch((e) => import_utils2.debugLogger.log("error", e));
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Screencast
});
