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
var import_artifact = require("./artifact");
var import_disposable = require("./disposable");
class Screencast {
  constructor(page) {
    this._started = false;
    this._onFrame = null;
    this._page = page;
    this._page._channel.on("screencastFrame", ({ data }) => {
      void this._onFrame?.({ data });
    });
  }
  async start(options = {}) {
    if (this._started)
      throw new Error("Screencast is already started");
    this._started = true;
    if (options.onFrame)
      this._onFrame = options.onFrame;
    const result = await this._page._channel.screencastStart({
      size: options.size,
      quality: options.quality,
      sendFrames: !!options.onFrame,
      record: !!options.path
    });
    if (result.artifact) {
      this._artifact = import_artifact.Artifact.from(result.artifact);
      this._savePath = options.path;
    }
    return new import_disposable.DisposableStub(() => this.stop());
  }
  async stop() {
    await this._page._wrapApiCall(async () => {
      this._started = false;
      this._onFrame = null;
      await this._page._channel.screencastStop();
      if (this._savePath)
        await this._artifact?.saveAs(this._savePath);
      this._artifact = void 0;
      this._savePath = void 0;
    });
  }
  async showActions(options) {
    await this._page._channel.screencastShowActions({ duration: options?.duration, position: options?.position, fontSize: options?.fontSize });
    return new import_disposable.DisposableStub(() => this._page._channel.screencastHideActions());
  }
  async hideActions() {
    await this._page._channel.screencastHideActions();
  }
  async showOverlay(html, options) {
    const { id } = await this._page._channel.screencastShowOverlay({ html, duration: options?.duration });
    return new import_disposable.DisposableStub(() => this._page._channel.screencastRemoveOverlay({ id }));
  }
  async showChapter(title, options) {
    await this._page._channel.screencastChapter({ title, ...options });
  }
  async showOverlays() {
    await this._page._channel.screencastSetOverlayVisible({ visible: true });
  }
  async hideOverlays() {
    await this._page._channel.screencastSetOverlayVisible({ visible: false });
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Screencast
});
