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
var playwrightWebSocketServer_exports = {};
__export(playwrightWebSocketServer_exports, {
  PlaywrightWebSocketServer: () => PlaywrightWebSocketServer
});
module.exports = __toCommonJS(playwrightWebSocketServer_exports);
var import_playwrightConnection = require("./playwrightConnection");
var import_serverTransport = require("./serverTransport");
var import_debugLogger = require("../server/utils/debugLogger");
var import_browser = require("../server/browser");
var import_utils = require("../utils");
var import_wsServer = require("../server/utils/wsServer");
class PlaywrightWebSocketServer {
  constructor(browser, path) {
    this._browser = browser;
    browser.on(import_browser.Browser.Events.Disconnected, () => this.close());
    const semaphore = new import_utils.Semaphore(Infinity);
    this._wsServer = new import_wsServer.WSServer({
      onRequest: (request, response) => {
        response.end("Running");
      },
      onUpgrade: () => void 0,
      onHeaders: () => {
      },
      onConnection: (request, url, ws, id) => {
        import_debugLogger.debugLogger.log("server", `[${id}] ws client connected`);
        return new import_playwrightConnection.PlaywrightConnection(
          semaphore,
          new import_serverTransport.WebSocketServerTransport(ws),
          false,
          this._browser.attribution.playwright,
          () => this._initPreLaunchedBrowserMode(id),
          id
        );
      }
    });
  }
  async _initPreLaunchedBrowserMode(id) {
    import_debugLogger.debugLogger.log("server", `[${id}] engaged pre-launched (browser) ws mode`);
    return {
      preLaunchedBrowser: this._browser,
      sharedBrowser: true,
      denyLaunch: true
    };
  }
  async listen(port = 0, hostname, path) {
    return await this._wsServer.listen(port, hostname, path || "/");
  }
  async close() {
    await this._wsServer.close();
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  PlaywrightWebSocketServer
});
