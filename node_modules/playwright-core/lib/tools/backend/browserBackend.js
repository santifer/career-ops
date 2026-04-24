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
var browserBackend_exports = {};
__export(browserBackend_exports, {
  BrowserBackend: () => BrowserBackend
});
module.exports = __toCommonJS(browserBackend_exports);
var import_context = require("./context");
var import_response = require("./response");
var import_sessionLog = require("./sessionLog");
var import_utilsBundle = require("../../utilsBundle");
class BrowserBackend {
  constructor(config, browserContext, tools) {
    this._config = config;
    this._tools = tools;
    this.browserContext = browserContext;
  }
  async initialize(clientInfo) {
    this._sessionLog = this._config.saveSession ? await import_sessionLog.SessionLog.create(this._config, clientInfo.cwd) : void 0;
    this._context = new import_context.Context(this.browserContext, {
      config: this._config,
      sessionLog: this._sessionLog,
      cwd: clientInfo.cwd
    });
  }
  async dispose() {
    await this._context?.dispose().catch((e) => (0, import_utilsBundle.debug)("pw:tools:error")(e));
  }
  async callTool(name, rawArguments = {}) {
    const tool = this._tools.find((tool2) => tool2.schema.name === name);
    if (!tool) {
      return {
        content: [{ type: "text", text: `### Error
Tool "${name}" not found` }],
        isError: true
      };
    }
    const parsedArguments = tool.schema.inputSchema.parse(rawArguments);
    const cwd = rawArguments._meta?.cwd;
    const context = this._context;
    const response = new import_response.Response(context, name, parsedArguments, cwd);
    context.setRunningTool(name);
    let responseObject;
    try {
      await tool.handle(context, parsedArguments, response);
      responseObject = await response.serialize();
      this._sessionLog?.logResponse(name, parsedArguments, responseObject);
    } catch (error) {
      return {
        content: [{ type: "text", text: `### Error
${String(error)}` }],
        isError: true
      };
    } finally {
      context.setRunningTool(void 0);
    }
    return responseObject;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  BrowserBackend
});
