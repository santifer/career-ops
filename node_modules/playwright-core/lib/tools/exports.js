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
var exports_exports = {};
__export(exports_exports, {
  BrowserBackend: () => import_browserBackend.BrowserBackend,
  Tab: () => import_tab.Tab,
  browserTools: () => import_tools.browserTools,
  createClientInfo: () => import_registry.createClientInfo,
  createConnection: () => import_mcp.createConnection,
  filteredTools: () => import_tools.filteredTools,
  logUnhandledError: () => import_log.logUnhandledError,
  parseResponse: () => import_response.parseResponse,
  setupExitWatchdog: () => import_watchdog.setupExitWatchdog,
  start: () => import_server.start,
  startCliDaemonServer: () => import_daemon.startCliDaemonServer,
  toMcpTool: () => import_tool.toMcpTool
});
module.exports = __toCommonJS(exports_exports);
var import_registry = require("./cli-client/registry");
var import_daemon = require("./cli-daemon/daemon");
var import_log = require("./mcp/log");
var import_watchdog = require("./mcp/watchdog");
var import_tool = require("./utils/mcp/tool");
var import_browserBackend = require("./backend/browserBackend");
var import_response = require("./backend/response");
var import_tab = require("./backend/tab");
var import_tools = require("./backend/tools");
var import_server = require("./utils/mcp/server");
var import_mcp = require("./mcp/index");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  BrowserBackend,
  Tab,
  browserTools,
  createClientInfo,
  createConnection,
  filteredTools,
  logUnhandledError,
  parseResponse,
  setupExitWatchdog,
  start,
  startCliDaemonServer,
  toMcpTool
});
