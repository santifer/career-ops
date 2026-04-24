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
var browser_exports = {};
__export(browser_exports, {
  Browser: () => Browser,
  BrowserServer: () => BrowserServer
});
module.exports = __toCommonJS(browser_exports);
var import_fs = __toESM(require("fs"));
var import_browserContext = require("./browserContext");
var import_download = require("./download");
var import_instrumentation = require("./instrumentation");
var import_socksClientCertificatesInterceptor = require("./socksClientCertificatesInterceptor");
var import_playwrightPipeServer = require("../remote/playwrightPipeServer");
var import_playwrightWebSocketServer = require("../remote/playwrightWebSocketServer");
var import_serverRegistry = require("../serverRegistry");
var import_fileUtils = require("./utils/fileUtils");
var import_utils = require("../utils");
class Browser extends import_instrumentation.SdkObject {
  constructor(parent, options) {
    super(parent, "browser");
    this._downloads = /* @__PURE__ */ new Map();
    this._defaultContext = null;
    this._startedClosing = false;
    this._isCollocatedWithServer = true;
    this.attribution.browser = this;
    this.options = options;
    this.instrumentation.onBrowserOpen(this);
    this._server = new BrowserServer(this);
  }
  static {
    this.Events = {
      Context: "context",
      Disconnected: "disconnected"
    };
  }
  sdkLanguage() {
    return this.options.sdkLanguage || this.attribution.playwright.options.sdkLanguage;
  }
  async newContext(progress, options) {
    (0, import_browserContext.validateBrowserContextOptions)(options, this.options);
    let clientCertificatesProxy;
    let context;
    try {
      if (options.clientCertificates?.length) {
        clientCertificatesProxy = await import_socksClientCertificatesInterceptor.ClientCertificatesProxy.create(progress, options);
        options = { ...options };
        options.proxyOverride = clientCertificatesProxy.proxySettings();
        options.internalIgnoreHTTPSErrors = true;
      }
      context = await progress.race(this.doCreateNewContext(options));
      context._clientCertificatesProxy = clientCertificatesProxy;
      if (options.__testHookBeforeSetStorageState)
        await progress.race(options.__testHookBeforeSetStorageState());
      await context.setStorageState(progress, options.storageState, "initial");
      this.emit(Browser.Events.Context, context);
      return context;
    } catch (error) {
      await context?.close({ reason: "Failed to create context" }).catch(() => {
      });
      await clientCertificatesProxy?.close().catch(() => {
      });
      throw error;
    }
  }
  async newContextForReuse(progress, params) {
    const hash = import_browserContext.BrowserContext.reusableContextHash(params);
    if (!this._contextForReuse || hash !== this._contextForReuse.hash || !this._contextForReuse.context.canResetForReuse()) {
      if (this._contextForReuse)
        await this._contextForReuse.context.close({ reason: "Context reused" });
      this._contextForReuse = { context: await this.newContext(progress, params), hash };
      return this._contextForReuse.context;
    }
    await this._contextForReuse.context.resetForReuse(progress, params);
    return this._contextForReuse.context;
  }
  contextForReuse() {
    return this._contextForReuse?.context;
  }
  _downloadCreated(page, uuid, url, suggestedFilename, downloadFilename) {
    const download = new import_download.Download(page, this.options.downloadsPath || "", uuid, url, suggestedFilename, downloadFilename);
    this._downloads.set(uuid, download);
  }
  _downloadFilenameSuggested(uuid, suggestedFilename) {
    const download = this._downloads.get(uuid);
    if (!download)
      return;
    download._filenameSuggested(suggestedFilename);
  }
  _downloadFinished(uuid, error) {
    const download = this._downloads.get(uuid);
    if (!download)
      return;
    download.artifact.reportFinished(error ? new Error(error) : void 0);
    this._downloads.delete(uuid);
  }
  async startServer(title, options) {
    return await this._server.start(title, options);
  }
  async stopServer() {
    await this._server.stop();
  }
  _didClose() {
    for (const context of this.contexts())
      context._browserClosed();
    if (this._defaultContext)
      this._defaultContext._browserClosed();
    this.stopServer().catch(() => {
    });
    this.emit(Browser.Events.Disconnected);
    this.instrumentation.onBrowserClose(this);
  }
  async close(options) {
    if (!this._startedClosing) {
      if (options.reason)
        this._closeReason = options.reason;
      this._startedClosing = true;
      await this.options.browserProcess.close();
    }
    if (this.isConnected())
      await new Promise((x) => this.once(Browser.Events.Disconnected, x));
  }
  async killForTests() {
    await this.options.browserProcess.kill();
  }
}
class BrowserServer {
  constructor(browser) {
    this._isStarted = false;
    this._browser = browser;
  }
  async start(title, options) {
    if (this._isStarted)
      throw new Error(`Server is already started.`);
    this._isStarted = true;
    let endpoint;
    if (options.host !== void 0 || options.port !== void 0) {
      this._wsServer = new import_playwrightWebSocketServer.PlaywrightWebSocketServer(this._browser, "/");
      endpoint = await this._wsServer.listen(options.port ?? 0, options.host, (0, import_utils.createGuid)());
    } else {
      this._pipeServer = new import_playwrightPipeServer.PlaywrightPipeServer(this._browser);
      this._pipeSocketPath = await this._socketPath();
      await this._pipeServer.listen(this._pipeSocketPath);
      endpoint = this._pipeSocketPath;
    }
    const browserInfo = {
      guid: this._browser.guid,
      browserName: this._browser.options.browserType,
      launchOptions: asClientLaunchOptions(this._browser.options.originalLaunchOptions),
      userDataDir: this._browser.options.userDataDir
    };
    await import_serverRegistry.serverRegistry.create(browserInfo, {
      title,
      endpoint,
      workspaceDir: options.workspaceDir,
      metadata: options.metadata
    });
    return { endpoint };
  }
  async stop() {
    if (!this._browser.options.userDataDir)
      await import_serverRegistry.serverRegistry.delete(this._browser.guid);
    if (this._pipeSocketPath && process.platform !== "win32")
      await import_fs.default.promises.unlink(this._pipeSocketPath).catch(() => {
      });
    await this._pipeServer?.close();
    await this._wsServer?.close();
    this._pipeServer = void 0;
    this._wsServer = void 0;
    this._isStarted = false;
  }
  async _socketPath() {
    return (0, import_fileUtils.makeSocketPath)("browser", this._browser.guid.slice(0, 14));
  }
}
function asClientLaunchOptions(serverOptions) {
  return {
    ...serverOptions,
    env: serverOptions.env ? Object.fromEntries(serverOptions.env.map(({ name, value }) => [name, value])) : void 0
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Browser,
  BrowserServer
});
