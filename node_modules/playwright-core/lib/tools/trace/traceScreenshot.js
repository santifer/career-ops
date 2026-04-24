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
var traceScreenshot_exports = {};
__export(traceScreenshot_exports, {
  traceScreenshot: () => traceScreenshot
});
module.exports = __toCommonJS(traceScreenshot_exports);
var import_traceUtils = require("./traceUtils");
async function traceScreenshot(actionId, options) {
  const trace = await (0, import_traceUtils.loadTrace)();
  const action = trace.resolveActionId(actionId);
  if (!action) {
    console.error(`Action '${actionId}' not found.`);
    process.exitCode = 1;
    return;
  }
  const pageId = action.pageId;
  if (!pageId) {
    console.error(`Action '${actionId}' has no associated page.`);
    process.exitCode = 1;
    return;
  }
  const callId = action.callId;
  const storage = trace.loader.storage();
  const snapshotNames = ["input", "before", "after"];
  let sha1;
  for (const name of snapshotNames) {
    const renderer = storage.snapshotByName(pageId, `${name}@${callId}`);
    sha1 = renderer?.closestScreenshot();
    if (sha1)
      break;
  }
  if (!sha1) {
    console.error(`No screenshot found for action '${actionId}'.`);
    process.exitCode = 1;
    return;
  }
  const blob = await trace.loader.resourceForSha1(sha1);
  if (!blob) {
    console.error(`Screenshot resource not found.`);
    process.exitCode = 1;
    return;
  }
  const defaultName = `screenshot-${actionId}.png`;
  const buffer = Buffer.from(await blob.arrayBuffer());
  const outFile = await (0, import_traceUtils.saveOutputFile)(defaultName, buffer, options.output);
  console.log(`  Screenshot saved to ${outFile}`);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  traceScreenshot
});
