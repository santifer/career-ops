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
var playwrightPipeServer_exports = {};
__export(playwrightPipeServer_exports, {
  PlaywrightPipeServer: () => PlaywrightPipeServer
});
module.exports = __toCommonJS(playwrightPipeServer_exports);
var import_net = __toESM(require("net"));
var import_fs = __toESM(require("fs"));
var import_playwrightConnection = require("./playwrightConnection");
var import_serverTransport = require("./serverTransport");
var import_debugLogger = require("../server/utils/debugLogger");
var import_browser = require("../server/browser");
var import_utils = require("../utils");
class PlaywrightPipeServer {
  constructor(browser) {
    this._connections = /* @__PURE__ */ new Set();
    this._connectionId = 0;
    this._browser = browser;
    browser.on(import_browser.Browser.Events.Disconnected, () => this.close());
  }
  async listen(pipeName) {
    if (!pipeName.startsWith("\\\\.\\pipe\\")) {
      try {
        import_fs.default.unlinkSync(pipeName);
      } catch {
      }
    }
    this._server = import_net.default.createServer((socket) => {
      const id = String(++this._connectionId);
      import_debugLogger.debugLogger.log("server", `[${id}] pipe client connected`);
      const transport = new import_serverTransport.SocketServerTransport(socket);
      const connection = new import_playwrightConnection.PlaywrightConnection(
        new import_utils.Semaphore(1),
        transport,
        false,
        this._browser.attribution.playwright,
        () => this._initPreLaunchedBrowserMode(id),
        id
      );
      this._connections.add(connection);
      transport.on("close", () => this._connections.delete(connection));
    });
    (0, import_utils.decorateServer)(this._server);
    await new Promise((resolve, reject) => {
      this._server.listen(pipeName, () => resolve());
      this._server.on("error", reject);
    });
    import_debugLogger.debugLogger.log("server", `Pipe server listening at ${pipeName}`);
  }
  async _initPreLaunchedBrowserMode(id) {
    import_debugLogger.debugLogger.log("server", `[${id}] engaged pre-launched (browser) pipe mode`);
    return {
      preLaunchedBrowser: this._browser,
      sharedBrowser: true,
      denyLaunch: true
    };
  }
  async close() {
    if (!this._server)
      return;
    import_debugLogger.debugLogger.log("server", "closing pipe server");
    for (const connection of this._connections)
      await connection.close({ code: 1001, reason: "Server closing" });
    this._connections.clear();
    await new Promise((f) => this._server.close(() => f()));
    this._server = void 0;
    import_debugLogger.debugLogger.log("server", "closed pipe server");
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  PlaywrightPipeServer
});
