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
var traceOpen_exports = {};
__export(traceOpen_exports, {
  traceOpen: () => traceOpen
});
module.exports = __toCommonJS(traceOpen_exports);
var import_traceUtils = require("./traceUtils");
var import_formatUtils = require("../../utils/isomorphic/formatUtils");
async function traceOpen(traceFile) {
  await (0, import_traceUtils.openTrace)(traceFile);
  await traceInfo();
}
async function traceInfo() {
  const trace = await (0, import_traceUtils.loadTrace)();
  const model = trace.model;
  const info = {
    browser: model.browserName || "unknown",
    platform: model.platform || "unknown",
    playwrightVersion: model.playwrightVersion || "unknown",
    title: model.title || "",
    duration: (0, import_formatUtils.msToString)(model.endTime - model.startTime),
    durationMs: model.endTime - model.startTime,
    startTime: model.wallTime ? new Date(model.wallTime).toISOString() : "unknown",
    viewport: model.options.viewport ? `${model.options.viewport.width}x${model.options.viewport.height}` : "default",
    actions: model.actions.length,
    pages: model.pages.length,
    network: model.resources.length,
    errors: model.errorDescriptors.length,
    attachments: model.attachments.length,
    consoleMessages: model.events.filter((e) => e.type === "console").length
  };
  console.log("");
  console.log(`  Browser:      ${info.browser}`);
  console.log(`  Platform:     ${info.platform}`);
  console.log(`  Playwright:   ${info.playwrightVersion}`);
  if (info.title)
    console.log(`  Title:        ${info.title}`);
  console.log(`  Duration:     ${info.duration}`);
  console.log(`  Start time:   ${info.startTime}`);
  console.log(`  Viewport:     ${info.viewport}`);
  console.log(`  Actions:      ${info.actions}`);
  console.log(`  Pages:        ${info.pages}`);
  console.log(`  Network:      ${info.network} requests`);
  console.log(`  Errors:       ${info.errors}`);
  console.log(`  Attachments:  ${info.attachments}`);
  console.log(`  Console:      ${info.consoleMessages} messages`);
  console.log("");
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  traceOpen
});
