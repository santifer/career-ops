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
var mcp_exports = {};
__export(mcp_exports, {
  createConnection: () => createConnection
});
module.exports = __toCommonJS(mcp_exports);
var import_config = require("./config");
var import_tools = require("../backend/tools");
var import_browserFactory = require("./browserFactory");
var import_browserBackend = require("../backend/browserBackend");
var import_server = require("../utils/mcp/server");
const packageJSON = require("../../../package.json");
async function createConnection(userConfig = {}, contextGetter) {
  const config = await (0, import_config.resolveConfig)(userConfig);
  const tools = (0, import_tools.filteredTools)(config);
  const backendFactory = {
    name: "api",
    nameInConfig: "api",
    version: packageJSON.version,
    toolSchemas: tools.map((tool) => tool.schema),
    create: async (clientInfo) => {
      const browser = contextGetter ? new SimpleBrowser(await contextGetter()) : await (0, import_browserFactory.createBrowser)(config, clientInfo);
      const context = config.browser.isolated ? await browser.newContext(config.browser.contextOptions) : browser.contexts()[0];
      return new import_browserBackend.BrowserBackend(config, context, tools);
    },
    disposed: async () => {
    }
  };
  return (0, import_server.createServer)("api", packageJSON.version, backendFactory, false);
}
class SimpleBrowser {
  constructor(context) {
    this._context = context;
  }
  contexts() {
    return [this._context];
  }
  async newContext() {
    throw new Error("Creating a new context is not supported in SimpleBrowserContextFactory.");
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createConnection
});
