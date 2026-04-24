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
var import_channelOwner = require("./channelOwner");
var import_events = require("./events");
class Debugger extends import_channelOwner.ChannelOwner {
  constructor(parent, type, guid, initializer) {
    super(parent, type, guid, initializer);
    this._pausedDetails = null;
    this._channel.on("pausedStateChanged", ({ pausedDetails }) => {
      this._pausedDetails = pausedDetails ?? null;
      this.emit(import_events.Events.Debugger.PausedStateChanged);
    });
  }
  static from(channel) {
    return channel._object;
  }
  async requestPause() {
    await this._channel.requestPause();
  }
  async resume() {
    await this._channel.resume();
  }
  async next() {
    await this._channel.next();
  }
  async runTo(location) {
    await this._channel.runTo({ location });
  }
  pausedDetails() {
    return this._pausedDetails;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Debugger
});
