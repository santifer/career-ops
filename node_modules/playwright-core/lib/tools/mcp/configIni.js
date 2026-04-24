"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var configIni_exports = {};
__export(configIni_exports, {
  configFromIniFile: () => configFromIniFile,
  configsFromIniFile: () => configsFromIniFile
});
module.exports = __toCommonJS(configIni_exports);
var import_fs = __toESM(require("fs"));
var import_utilsBundle = require("../../utilsBundle");
function configFromIniFile(filePath) {
  const content = import_fs.default.readFileSync(filePath, "utf8");
  const parsed = import_utilsBundle.ini.parse(content);
  return iniEntriesToConfig(parsed);
}
function configsFromIniFile(filePath) {
  const content = import_fs.default.readFileSync(filePath, "utf8");
  const parsed = import_utilsBundle.ini.parse(content);
  const result = /* @__PURE__ */ new Map();
  for (const [sectionName, sectionData] of Object.entries(parsed)) {
    if (typeof sectionData !== "object" || sectionData === null)
      continue;
    result.set(sectionName, iniEntriesToConfig(sectionData));
  }
  return result;
}
function iniEntriesToConfig(entries) {
  const config = {};
  for (const [targetPath, rawValue] of Object.entries(entries)) {
    const type = longhandTypes[targetPath];
    const value = type ? coerceToType(rawValue, type) : coerceIniValue(rawValue);
    setNestedValue(config, targetPath, value);
  }
  return config;
}
function coerceToType(value, type) {
  switch (type) {
    case "string":
      return String(value);
    case "number":
      return Number(value);
    case "boolean":
      if (typeof value === "boolean")
        return value;
      return value === "true" || value === "1";
    case "string[]":
      if (Array.isArray(value))
        return value.map(String);
      return [String(value)];
    case "size": {
      if (typeof value === "string" && value.includes("x")) {
        const [w, h] = value.split("x").map(Number);
        if (!isNaN(w) && !isNaN(h) && w > 0 && h > 0)
          return { width: w, height: h };
      }
      return void 0;
    }
  }
}
function coerceIniValue(value) {
  if (typeof value !== "string")
    return value;
  const trimmed = value.trim();
  if (trimmed === "")
    return trimmed;
  const num = Number(trimmed);
  if (!isNaN(num))
    return num;
  return value;
}
function setNestedValue(obj, dotPath, value) {
  const parts = dotPath.split(".");
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || typeof current[part] !== "object" || current[part] === null)
      current[part] = {};
    current = current[part];
  }
  current[parts[parts.length - 1]] = value;
}
const longhandTypes = {
  // browser direct
  "browser.browserName": "string",
  "browser.isolated": "boolean",
  "browser.userDataDir": "string",
  "browser.cdpEndpoint": "string",
  "browser.cdpTimeout": "number",
  "browser.remoteEndpoint": "string",
  "browser.initPage": "string[]",
  "browser.initScript": "string[]",
  // browser.launchOptions
  "browser.launchOptions.channel": "string",
  "browser.launchOptions.headless": "boolean",
  "browser.launchOptions.executablePath": "string",
  "browser.launchOptions.chromiumSandbox": "boolean",
  "browser.launchOptions.args": "string[]",
  "browser.launchOptions.downloadsPath": "string",
  "browser.launchOptions.handleSIGHUP": "boolean",
  "browser.launchOptions.handleSIGINT": "boolean",
  "browser.launchOptions.handleSIGTERM": "boolean",
  "browser.launchOptions.slowMo": "number",
  "browser.launchOptions.timeout": "number",
  "browser.launchOptions.tracesDir": "string",
  "browser.launchOptions.proxy.server": "string",
  "browser.launchOptions.proxy.bypass": "string",
  "browser.launchOptions.proxy.username": "string",
  "browser.launchOptions.proxy.password": "string",
  // browser.contextOptions
  "browser.contextOptions.acceptDownloads": "boolean",
  "browser.contextOptions.baseURL": "string",
  "browser.contextOptions.bypassCSP": "boolean",
  "browser.contextOptions.colorScheme": "string",
  "browser.contextOptions.contrast": "string",
  "browser.contextOptions.deviceScaleFactor": "number",
  "browser.contextOptions.forcedColors": "string",
  "browser.contextOptions.hasTouch": "boolean",
  "browser.contextOptions.ignoreHTTPSErrors": "boolean",
  "browser.contextOptions.isMobile": "boolean",
  "browser.contextOptions.javaScriptEnabled": "boolean",
  "browser.contextOptions.locale": "string",
  "browser.contextOptions.offline": "boolean",
  "browser.contextOptions.permissions": "string[]",
  "browser.contextOptions.reducedMotion": "string",
  "browser.contextOptions.screen": "size",
  "browser.contextOptions.serviceWorkers": "string",
  "browser.contextOptions.storageState": "string",
  "browser.contextOptions.strictSelectors": "boolean",
  "browser.contextOptions.timezoneId": "string",
  "browser.contextOptions.userAgent": "string",
  "browser.contextOptions.viewport": "size",
  // top-level
  "extension": "boolean",
  "capabilities": "string[]",
  "saveSession": "boolean",
  "saveTrace": "boolean",
  "saveVideo": "size",
  "sharedBrowserContext": "boolean",
  "outputDir": "string",
  "imageResponses": "string",
  "allowUnrestrictedFileAccess": "boolean",
  "codegen": "string",
  "testIdAttribute": "string",
  // server
  "server.port": "number",
  "server.host": "string",
  "server.allowedHosts": "string[]",
  // console
  "console.level": "string",
  // network
  "network.allowedOrigins": "string[]",
  "network.blockedOrigins": "string[]",
  // timeouts
  "timeouts.action": "number",
  "timeouts.navigation": "number",
  // snapshot
  "snapshot.mode": "string"
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  configFromIniFile,
  configsFromIniFile
});
