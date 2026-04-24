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
var extensionContextFactory_exports = {};
__export(extensionContextFactory_exports, {
  createExtensionBrowser: () => createExtensionBrowser
});
module.exports = __toCommonJS(extensionContextFactory_exports);
var playwright = __toESM(require("../../.."));
var import_utilsBundle = require("../../utilsBundle");
var import_network = require("../../server/utils/network");
var import_cdpRelay = require("./cdpRelay");
const debugLogger = (0, import_utilsBundle.debug)("pw:mcp:relay");
async function createExtensionBrowser(config, clientInfo) {
  const httpServer = (0, import_network.createHttpServer)();
  await (0, import_network.startHttpServer)(httpServer, {});
  const relay = new import_cdpRelay.CDPRelayServer(
    httpServer,
    config.browser.launchOptions.channel || "chrome",
    config.browser.userDataDir,
    config.browser.launchOptions.executablePath
  );
  debugLogger(`CDP relay server started, extension endpoint: ${relay.extensionEndpoint()}.`);
  await relay.ensureExtensionConnectionForMCPContext(clientInfo);
  return await playwright.chromium.connectOverCDP(relay.cdpEndpoint(), { isLocal: true });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createExtensionBrowser
});
