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
var formatUtils_exports = {};
__export(formatUtils_exports, {
  bytesToString: () => bytesToString,
  msToString: () => msToString
});
module.exports = __toCommonJS(formatUtils_exports);
function msToString(ms) {
  if (ms < 0 || !isFinite(ms))
    return "-";
  if (ms === 0)
    return "0ms";
  if (ms < 1e3)
    return ms.toFixed(0) + "ms";
  const seconds = ms / 1e3;
  if (seconds < 60)
    return seconds.toFixed(1) + "s";
  const minutes = seconds / 60;
  if (minutes < 60)
    return minutes.toFixed(1) + "m";
  const hours = minutes / 60;
  if (hours < 24)
    return hours.toFixed(1) + "h";
  const days = hours / 24;
  return days.toFixed(1) + "d";
}
function bytesToString(bytes) {
  if (bytes < 0 || !isFinite(bytes))
    return "-";
  if (bytes === 0)
    return "0";
  if (bytes < 1e3)
    return bytes.toFixed(0);
  const kb = bytes / 1024;
  if (kb < 1e3)
    return kb.toFixed(1) + "K";
  const mb = kb / 1024;
  if (mb < 1e3)
    return mb.toFixed(1) + "M";
  const gb = mb / 1024;
  return gb.toFixed(1) + "G";
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  bytesToString,
  msToString
});
