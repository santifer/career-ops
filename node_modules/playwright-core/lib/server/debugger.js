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
var debugger_exports = {};
__export(debugger_exports, {
  Debugger: () => Debugger
});
module.exports = __toCommonJS(debugger_exports);
var import_instrumentation = require("./instrumentation");
var import_utils = require("../utils");
var import_browserContext = require("./browserContext");
var import_protocolMetainfo = require("../utils/isomorphic/protocolMetainfo");
const symbol = Symbol("Debugger");
class Debugger extends import_instrumentation.SdkObject {
  constructor(context) {
    super(context, "debugger");
    this._pauseAt = {};
    this._enabled = false;
    this._pauseBeforeWaitingActions = false;
    this._muted = false;
    this._context = context;
    this._context[symbol] = this;
    context.instrumentation.addListener(this, context);
    this._context.once(import_browserContext.BrowserContext.Events.Close, () => {
      this._context.instrumentation.removeListener(this);
    });
  }
  static {
    this.Events = {
      PausedStateChanged: "pausedstatechanged"
    };
  }
  async setMuted(muted) {
    this._muted = muted;
  }
  async onBeforeCall(sdkObject, metadata) {
    if (this._muted || metadata.internal)
      return;
    const metainfo = (0, import_protocolMetainfo.getMetainfo)(metadata);
    const pauseOnPauseCall = this._enabled && metadata.type === "BrowserContext" && metadata.method === "pause";
    const pauseBeforeAction = !!this._pauseAt.next && !!metainfo?.pause && (this._pauseBeforeWaitingActions || !metainfo?.isAutoWaiting);
    const pauseOnLocation = !!this._pauseAt.location && matchesLocation(metadata, this._pauseAt.location);
    if (pauseOnPauseCall || pauseBeforeAction || pauseOnLocation)
      await this._pause(sdkObject, metadata);
  }
  async onBeforeInputAction(sdkObject, metadata) {
    if (this._muted || metadata.internal)
      return;
    const metainfo = (0, import_protocolMetainfo.getMetainfo)(metadata);
    const pauseBeforeInput = !!this._pauseAt.next && !!metainfo?.pause && !!metainfo?.isAutoWaiting && !this._pauseBeforeWaitingActions;
    if (pauseBeforeInput)
      await this._pause(sdkObject, metadata);
  }
  async _pause(sdkObject, metadata) {
    if (this._muted || metadata.internal)
      return;
    if (this._pausedCall)
      return;
    this._pauseAt = {};
    metadata.pauseStartTime = (0, import_utils.monotonicTime)();
    const result = new Promise((resolve) => {
      this._pausedCall = { metadata, sdkObject, resolve };
    });
    this.emit(Debugger.Events.PausedStateChanged);
    return result;
  }
  resume() {
    if (!this._pausedCall)
      return;
    this._pausedCall.metadata.pauseEndTime = (0, import_utils.monotonicTime)();
    this._pausedCall.resolve();
    this._pausedCall = void 0;
    this.emit(Debugger.Events.PausedStateChanged);
  }
  setPauseBeforeWaitingActions() {
    this._pauseBeforeWaitingActions = true;
  }
  setPauseAt(at = {}) {
    this._enabled = true;
    this._pauseAt = at;
  }
  isPaused(metadata) {
    if (metadata)
      return this._pausedCall?.metadata === metadata;
    return !!this._pausedCall;
  }
  pausedDetails() {
    return this._pausedCall;
  }
}
function matchesLocation(metadata, location) {
  return !!metadata.location?.file.includes(location.file) && (location.line === void 0 || metadata.location.line === location.line) && (location.column === void 0 || metadata.location.column === location.column);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Debugger
});
