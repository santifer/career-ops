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
var disposable_exports = {};
__export(disposable_exports, {
  DisposableObject: () => DisposableObject,
  disposeAll: () => disposeAll
});
module.exports = __toCommonJS(disposable_exports);
var import_instrumentation = require("./instrumentation");
class DisposableObject extends import_instrumentation.SdkObject {
  constructor(parent) {
    super(parent, "disposable");
    this.parent = parent;
  }
}
async function disposeAll(disposables) {
  const copy = [...disposables];
  disposables.length = 0;
  await Promise.all(copy.map((d) => d.dispose()));
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DisposableObject,
  disposeAll
});
