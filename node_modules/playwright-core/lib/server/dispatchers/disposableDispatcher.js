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
var disposableDispatcher_exports = {};
__export(disposableDispatcher_exports, {
  DisposableDispatcher: () => DisposableDispatcher
});
module.exports = __toCommonJS(disposableDispatcher_exports);
var import_dispatcher = require("./dispatcher");
class DisposableDispatcher extends import_dispatcher.Dispatcher {
  constructor(scope, disposable) {
    super(scope, disposable, "Disposable", {});
    this._type_Disposable = true;
  }
  async dispose(_, progress) {
    progress.metadata.potentiallyClosesScope = true;
    await this._object.dispose();
    this._dispose();
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DisposableDispatcher
});
