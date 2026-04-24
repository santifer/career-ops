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
var debuggerDispatcher_exports = {};
__export(debuggerDispatcher_exports, {
  DebuggerDispatcher: () => DebuggerDispatcher
});
module.exports = __toCommonJS(debuggerDispatcher_exports);
var import_dispatcher = require("./dispatcher");
var import_debugger = require("../debugger");
var import_protocolFormatter = require("../../utils/isomorphic/protocolFormatter");
class DebuggerDispatcher extends import_dispatcher.Dispatcher {
  constructor(scope, debugger_) {
    super(scope, debugger_, "Debugger", {});
    this._type_EventTarget = true;
    this._type_Debugger = true;
    this.addObjectListener(import_debugger.Debugger.Events.PausedStateChanged, () => {
      this._dispatchEvent("pausedStateChanged", { pausedDetails: this._serializePausedDetails() });
    });
    this._dispatchEvent("pausedStateChanged", { pausedDetails: this._serializePausedDetails() });
  }
  static from(scope, debugger_) {
    const result = scope.connection.existingDispatcher(debugger_);
    return result || new DebuggerDispatcher(scope, debugger_);
  }
  _serializePausedDetails() {
    const details = this._object.pausedDetails();
    if (!details)
      return void 0;
    const { metadata } = details;
    return {
      location: {
        file: metadata.location?.file ?? "<unknown>",
        line: metadata.location?.line,
        column: metadata.location?.column
      },
      title: (0, import_protocolFormatter.renderTitleForCall)(metadata)
    };
  }
  async requestPause(params, progress) {
    if (this._object.isPaused())
      throw new Error("Debugger is already paused");
    this._object.setPauseBeforeWaitingActions();
    this._object.setPauseAt({ next: true });
  }
  async resume(params, progress) {
    if (!this._object.isPaused())
      throw new Error("Debugger is not paused");
    this._object.resume();
  }
  async next(params, progress) {
    if (!this._object.isPaused())
      throw new Error("Debugger is not paused");
    this._object.setPauseBeforeWaitingActions();
    this._object.setPauseAt({ next: true });
    this._object.resume();
  }
  async runTo(params, progress) {
    if (!this._object.isPaused())
      throw new Error("Debugger is not paused");
    this._object.setPauseBeforeWaitingActions();
    this._object.setPauseAt({ location: params.location });
    this._object.resume();
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DebuggerDispatcher
});
