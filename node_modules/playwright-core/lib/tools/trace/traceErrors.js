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
var traceErrors_exports = {};
__export(traceErrors_exports, {
  traceErrors: () => traceErrors
});
module.exports = __toCommonJS(traceErrors_exports);
var import_traceUtils = require("./traceUtils");
async function traceErrors() {
  const trace = await (0, import_traceUtils.loadTrace)();
  const model = trace.model;
  if (!model.errorDescriptors.length) {
    console.log("  No errors");
    return;
  }
  for (const error of model.errorDescriptors) {
    if (error.action) {
      const title = (0, import_traceUtils.actionTitle)(error.action);
      console.log(`
  \u2717 ${title}`);
    } else {
      console.log(`
  \u2717 Error`);
    }
    if (error.stack?.length) {
      const frame = error.stack[0];
      const file = frame.file.replace(/.*[/\\](.*)/, "$1");
      console.log(`    at ${file}:${frame.line}:${frame.column}`);
    }
    console.log("");
    const indented = error.message.split("\n").map((l) => `    ${l}`).join("\n");
    console.log(indented);
  }
  console.log("");
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  traceErrors
});
