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
var connect_exports = {};
__export(connect_exports, {
  connectToBrowser: () => connectToBrowser,
  connectToEndpoint: () => connectToEndpoint
});
module.exports = __toCommonJS(connect_exports);
var import_time = require("../utils/isomorphic/time");
var import_timeoutRunner = require("../utils/isomorphic/timeoutRunner");
var import_browser = require("./browser");
var import_connection = require("./connection");
var import_events = require("./events");
async function connectToBrowser(playwright, params) {
  const deadline = params.timeout ? (0, import_time.monotonicTime)() + params.timeout : 0;
  const nameParam = params.browserName ? { "x-playwright-browser": params.browserName } : {};
  const headers = { ...nameParam, ...params.headers };
  const connectParams = {
    endpoint: params.endpoint,
    headers,
    exposeNetwork: params.exposeNetwork,
    slowMo: params.slowMo,
    timeout: params.timeout || 0
  };
  if (params.__testHookRedirectPortForwarding)
    connectParams.socksProxyRedirectPortForTest = params.__testHookRedirectPortForwarding;
  const connection = await connectToEndpoint(playwright._connection, connectParams);
  let browser;
  connection.on("close", () => {
    for (const context of browser?.contexts() || []) {
      for (const page of context.pages())
        page._onClose();
      context._onClose();
    }
    setTimeout(() => browser?._didClose(), 0);
  });
  const result = await (0, import_timeoutRunner.raceAgainstDeadline)(async () => {
    if (params.__testHookBeforeCreateBrowser)
      await params.__testHookBeforeCreateBrowser();
    const playwright2 = await connection.initializePlaywright();
    if (!playwright2._initializer.preLaunchedBrowser) {
      connection.close();
      throw new Error("Malformed endpoint. Did you use BrowserType.launchServer method?");
    }
    playwright2.selectors = playwright2.selectors;
    browser = import_browser.Browser.from(playwright2._initializer.preLaunchedBrowser);
    browser._shouldCloseConnectionOnClose = true;
    browser.on(import_events.Events.Browser.Disconnected, () => connection.close());
    return browser;
  }, deadline);
  if (!result.timedOut) {
    return result.result;
  } else {
    connection.close();
    throw new Error(`Timeout ${params.timeout}ms exceeded`);
  }
}
async function connectToEndpoint(parentConnection, params) {
  const localUtils = parentConnection.localUtils();
  const transport = localUtils ? new JsonPipeTransport(localUtils) : new WebSocketTransport();
  const connectHeaders = await transport.connect(params);
  const connection = new import_connection.Connection(parentConnection._platform, localUtils, parentConnection._instrumentation, connectHeaders);
  connection.markAsRemote();
  connection.on("close", () => transport.close());
  let closeError;
  const onTransportClosed = (reason) => {
    connection.close(reason || closeError);
  };
  transport.onClose((reason) => onTransportClosed(reason));
  connection.onmessage = (message) => transport.send(message).catch(() => onTransportClosed());
  transport.onMessage((message) => {
    try {
      connection.dispatch(message);
    } catch (e) {
      closeError = String(e);
      transport.close().catch(() => {
      });
    }
  });
  return connection;
}
class JsonPipeTransport {
  constructor(owner) {
    this._owner = owner;
  }
  async connect(params) {
    const { pipe, headers: connectHeaders } = await this._owner._channel.connect(params);
    this._pipe = pipe;
    return connectHeaders;
  }
  async send(message) {
    await this._pipe.send({ message });
  }
  onMessage(callback) {
    this._pipe.on("message", ({ message }) => callback(message));
  }
  onClose(callback) {
    this._pipe.on("closed", ({ reason }) => callback(reason));
  }
  async close() {
    await this._pipe.close().catch(() => {
    });
  }
}
class WebSocketTransport {
  async connect(params) {
    this._ws = new window.WebSocket(params.endpoint);
    return [];
  }
  async send(message) {
    this._ws.send(JSON.stringify(message));
  }
  onMessage(callback) {
    this._ws.addEventListener("message", (event) => callback(JSON.parse(event.data)));
  }
  onClose(callback) {
    this._ws.addEventListener("close", () => callback());
  }
  async close() {
    this._ws.close();
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  connectToBrowser,
  connectToEndpoint
});
