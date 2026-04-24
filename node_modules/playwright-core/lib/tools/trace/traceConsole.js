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
var traceConsole_exports = {};
__export(traceConsole_exports, {
  traceConsole: () => traceConsole
});
module.exports = __toCommonJS(traceConsole_exports);
var import_traceUtils = require("./traceUtils");
async function traceConsole(options) {
  const trace = await (0, import_traceUtils.loadTrace)();
  const model = trace.model;
  const items = [];
  for (const event of model.events) {
    if (event.type === "console") {
      if (options.stdio)
        continue;
      const level = event.messageType;
      if (options.errorsOnly && level !== "error")
        continue;
      if (options.warnings && level !== "error" && level !== "warning")
        continue;
      const url = event.location.url;
      const filename = url ? url.substring(url.lastIndexOf("/") + 1) : "<anonymous>";
      items.push({
        type: "browser",
        level,
        text: event.text,
        location: `${filename}:${event.location.lineNumber}`,
        timestamp: event.time
      });
    }
    if (event.type === "event" && event.method === "pageError") {
      if (options.stdio)
        continue;
      const error = event.params.error;
      items.push({
        type: "browser",
        level: "error",
        text: error?.error?.message || String(error?.value || ""),
        timestamp: event.time
      });
    }
  }
  for (const event of model.stdio) {
    if (options.browser)
      continue;
    if (options.errorsOnly && event.type !== "stderr")
      continue;
    if (options.warnings && event.type !== "stderr")
      continue;
    let text = "";
    if (event.text)
      text = event.text.trim();
    if (event.base64)
      text = Buffer.from(event.base64, "base64").toString("utf-8").trim();
    if (!text)
      continue;
    items.push({
      type: event.type,
      level: event.type === "stderr" ? "error" : "info",
      text,
      timestamp: event.timestamp
    });
  }
  items.sort((a, b) => a.timestamp - b.timestamp);
  if (!items.length) {
    console.log("  No console entries");
    return;
  }
  for (const item of items) {
    const ts = (0, import_traceUtils.formatTimestamp)(item.timestamp, model.startTime);
    const source = item.type === "browser" ? "[browser]" : `[${item.type}]`;
    const level = item.level.padEnd(8);
    const location = item.location ? `  ${item.location}` : "";
    console.log(`  ${ts}  ${source.padEnd(10)} ${level} ${item.text}${location}`);
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  traceConsole
});
