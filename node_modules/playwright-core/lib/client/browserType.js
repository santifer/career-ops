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
var browserType_exports = {};
__export(browserType_exports, {
  BrowserType: () => BrowserType
});
module.exports = __toCommonJS(browserType_exports);
var import_browser = require("./browser");
var import_browserContext = require("./browserContext");
var import_channelOwner = require("./channelOwner");
var import_clientHelper = require("./clientHelper");
var import_assert = require("../utils/isomorphic/assert");
var import_headers = require("../utils/isomorphic/headers");
var import_connect = require("./connect");
var import_timeoutSettings = require("./timeoutSettings");
class BrowserType extends import_channelOwner.ChannelOwner {
  constructor() {
    super(...arguments);
    this._contexts = /* @__PURE__ */ new Set();
  }
  static from(browserType) {
    return browserType._object;
  }
  executablePath() {
    if (!this._initializer.executablePath)
      throw new Error("Browser is not supported on current platform");
    return this._initializer.executablePath;
  }
  name() {
    return this._initializer.name;
  }
  async launch(options = {}) {
    (0, import_assert.assert)(!options.userDataDir, "userDataDir option is not supported in `browserType.launch`. Use `browserType.launchPersistentContext` instead");
    (0, import_assert.assert)(!options.port, "Cannot specify a port without launching as a server.");
    const logger = options.logger || this._playwright._defaultLaunchOptions?.logger;
    options = { ...this._playwright._defaultLaunchOptions, ...options };
    const launchOptions = {
      ...options,
      ignoreDefaultArgs: Array.isArray(options.ignoreDefaultArgs) ? options.ignoreDefaultArgs : void 0,
      ignoreAllDefaultArgs: !!options.ignoreDefaultArgs && !Array.isArray(options.ignoreDefaultArgs),
      env: options.env ? (0, import_clientHelper.envObjectToArray)(options.env) : void 0,
      timeout: new import_timeoutSettings.TimeoutSettings(this._platform).launchTimeout(options)
    };
    return await this._wrapApiCall(async () => {
      const browser = import_browser.Browser.from((await this._channel.launch(launchOptions)).browser);
      browser._connectToBrowserType(this, options, logger);
      return browser;
    });
  }
  async launchServer(options = {}) {
    if (!this._serverLauncher)
      throw new Error("Launching server is not supported");
    options = { ...this._playwright._defaultLaunchOptions, ...options };
    return await this._serverLauncher.launchServer(options);
  }
  async launchPersistentContext(userDataDir, options = {}) {
    (0, import_assert.assert)(!options.port, "Cannot specify a port without launching as a server.");
    options = this._playwright.selectors._withSelectorOptions({
      ...this._playwright._defaultLaunchOptions,
      ...options
    });
    await this._instrumentation.runBeforeCreateBrowserContext(options);
    const logger = options.logger || this._playwright._defaultLaunchOptions?.logger;
    const contextParams = await (0, import_browserContext.prepareBrowserContextParams)(this._platform, options);
    const persistentParams = {
      ...contextParams,
      ignoreDefaultArgs: Array.isArray(options.ignoreDefaultArgs) ? options.ignoreDefaultArgs : void 0,
      ignoreAllDefaultArgs: !!options.ignoreDefaultArgs && !Array.isArray(options.ignoreDefaultArgs),
      env: options.env ? (0, import_clientHelper.envObjectToArray)(options.env) : void 0,
      channel: options.channel,
      userDataDir: this._platform.path().isAbsolute(userDataDir) || !userDataDir ? userDataDir : this._platform.path().resolve(userDataDir),
      timeout: new import_timeoutSettings.TimeoutSettings(this._platform).launchTimeout(options)
    };
    const context = await this._wrapApiCall(async () => {
      const result = await this._channel.launchPersistentContext(persistentParams);
      const browser = import_browser.Browser.from(result.browser);
      browser._connectToBrowserType(this, options, logger);
      const context2 = import_browserContext.BrowserContext.from(result.context);
      await context2._initializeHarFromOptions(options.recordHar);
      return context2;
    });
    await this._instrumentation.runAfterCreateBrowserContext(context);
    return context;
  }
  async connect(optionsOrEndpoint, options) {
    if (typeof optionsOrEndpoint === "string")
      return await this._connect({ ...options, endpoint: optionsOrEndpoint });
    (0, import_assert.assert)(optionsOrEndpoint.wsEndpoint, "options.wsEndpoint is required");
    return await this._connect({ ...options, endpoint: optionsOrEndpoint.wsEndpoint });
  }
  async _connect(params) {
    const logger = params.logger;
    return await this._wrapApiCall(async () => {
      const browser = await (0, import_connect.connectToBrowser)(this._playwright, { browserName: this.name(), ...params });
      browser._connectToBrowserType(this, {}, logger);
      return browser;
    });
  }
  async connectOverCDP(endpointURLOrOptions, options) {
    if (typeof endpointURLOrOptions === "string")
      return await this._connectOverCDP(endpointURLOrOptions, options);
    const endpointURL = "endpointURL" in endpointURLOrOptions ? endpointURLOrOptions.endpointURL : endpointURLOrOptions.wsEndpoint;
    (0, import_assert.assert)(endpointURL, "Cannot connect over CDP without wsEndpoint.");
    return await this.connectOverCDP(endpointURL, endpointURLOrOptions);
  }
  async _connectOverCDP(endpointURL, params = {}) {
    if (this.name() !== "chromium")
      throw new Error("Connecting over CDP is only supported in Chromium.");
    const headers = params.headers ? (0, import_headers.headersObjectToArray)(params.headers) : void 0;
    const result = await this._channel.connectOverCDP({
      endpointURL,
      headers,
      slowMo: params.slowMo,
      timeout: new import_timeoutSettings.TimeoutSettings(this._platform).timeout(params),
      isLocal: params.isLocal
    });
    const browser = import_browser.Browser.from(result.browser);
    browser._connectToBrowserType(this, {}, params.logger);
    if (result.defaultContext)
      await this._instrumentation.runAfterCreateBrowserContext(import_browserContext.BrowserContext.from(result.defaultContext));
    return browser;
  }
  async _connectOverCDPTransport(transport) {
    if (this.name() !== "chromium")
      throw new Error("Connecting over CDP is only supported in Chromium.");
    const result = await this._channel.connectOverCDPTransport({ transport });
    const browser = import_browser.Browser.from(result.browser);
    browser._connectToBrowserType(this, {}, void 0);
    if (result.defaultContext)
      await this._instrumentation.runAfterCreateBrowserContext(import_browserContext.BrowserContext.from(result.defaultContext));
    return browser;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  BrowserType
});
