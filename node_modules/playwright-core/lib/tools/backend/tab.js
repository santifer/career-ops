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
var tab_exports = {};
__export(tab_exports, {
  Tab: () => Tab,
  renderModalStates: () => renderModalStates,
  shouldIncludeMessage: () => shouldIncludeMessage
});
module.exports = __toCommonJS(tab_exports);
var import_url = __toESM(require("url"));
var import_events = require("events");
var import_locatorGenerators = require("../../utils/isomorphic/locatorGenerators");
var import_locatorParser = require("../../utils/isomorphic/locatorParser");
var import_manualPromise = require("../../utils/isomorphic/manualPromise");
var import_utilsBundle = require("../../utilsBundle");
var import_eventsHelper = require("../../server/utils/eventsHelper");
var import_disposable = require("../../server/utils/disposable");
var import_utils = require("./utils");
var import_logFile = require("./logFile");
var import_dialogs = require("./dialogs");
var import_files = require("./files");
const TabEvents = {
  modalState: "modalState"
};
class Tab extends import_events.EventEmitter {
  constructor(context, page, onPageClose) {
    super();
    this._lastHeader = { title: "about:blank", url: "about:blank", current: false, console: { total: 0, warnings: 0, errors: 0 } };
    this._downloads = [];
    this._requests = [];
    this._modalStates = [];
    this._recentEventEntries = [];
    this.context = context;
    this.page = page;
    this._onPageClose = onPageClose;
    const p = page;
    this._disposables = [
      import_eventsHelper.eventsHelper.addEventListener(p, "console", (event) => this._handleConsoleMessage(messageToConsoleMessage(event))),
      import_eventsHelper.eventsHelper.addEventListener(p, "pageerror", (error) => this._handleConsoleMessage(pageErrorToConsoleMessage(error))),
      import_eventsHelper.eventsHelper.addEventListener(p, "request", (request) => this._handleRequest(request)),
      import_eventsHelper.eventsHelper.addEventListener(p, "response", (response) => this._handleResponse(response)),
      import_eventsHelper.eventsHelper.addEventListener(p, "requestfailed", (request) => this._handleRequestFailed(request)),
      import_eventsHelper.eventsHelper.addEventListener(p, "close", () => this._onClose()),
      import_eventsHelper.eventsHelper.addEventListener(p, "filechooser", (chooser) => {
        this.setModalState({
          type: "fileChooser",
          description: "File chooser",
          fileChooser: chooser,
          clearedBy: { tool: import_files.uploadFile.schema.name, skill: "upload" }
        });
      }),
      import_eventsHelper.eventsHelper.addEventListener(p, "dialog", (dialog) => this._dialogShown(dialog)),
      import_eventsHelper.eventsHelper.addEventListener(p, "download", (download) => {
        void this._downloadStarted(download);
      })
    ];
    page[tabSymbol] = this;
    const wallTime = Date.now();
    this._consoleLog = new import_logFile.LogFile(this.context, wallTime, "console", "Console");
    this._initializedPromise = this._initialize();
    this.actionTimeoutOptions = { timeout: context.config.timeouts?.action };
    this.navigationTimeoutOptions = { timeout: context.config.timeouts?.navigation };
    this.expectTimeoutOptions = { timeout: context.config.timeouts?.expect };
  }
  async dispose() {
    await (0, import_disposable.disposeAll)(this._disposables);
    this._consoleLog.stop();
  }
  static forPage(page) {
    return page[tabSymbol];
  }
  static async collectConsoleMessages(page) {
    const result = [];
    const messages = await page.consoleMessages().catch(() => []);
    for (const message of messages)
      result.push(messageToConsoleMessage(message));
    const errors = await page.pageErrors().catch(() => []);
    for (const error of errors)
      result.push(pageErrorToConsoleMessage(error));
    return result;
  }
  async _initialize() {
    for (const message of await Tab.collectConsoleMessages(this.page))
      this._handleConsoleMessage(message);
    const requests = await this.page.requests().catch(() => []);
    for (const request of requests.filter((r) => r.existingResponse() || r.failure()))
      this._requests.push(request);
    for (const initPage of this.context.config.browser?.initPage || []) {
      try {
        const { default: func } = await import(import_url.default.pathToFileURL(initPage).href);
        await func({ page: this.page });
      } catch (e) {
        (0, import_utilsBundle.debug)("pw:tools:error")(e);
      }
    }
  }
  modalStates() {
    return this._modalStates;
  }
  setModalState(modalState) {
    this._modalStates.push(modalState);
    this.emit(TabEvents.modalState, modalState);
  }
  clearModalState(modalState) {
    this._modalStates = this._modalStates.filter((state) => state !== modalState);
  }
  _dialogShown(dialog) {
    this.setModalState({
      type: "dialog",
      description: `"${dialog.type()}" dialog with message "${dialog.message()}"`,
      dialog,
      clearedBy: { tool: import_dialogs.handleDialog.schema.name, skill: "dialog-accept or dialog-dismiss" }
    });
  }
  async _downloadStarted(download) {
    const outputFile = await this.context.outputFile({ suggestedFilename: sanitizeForFilePath(download.suggestedFilename()), prefix: "download", ext: "bin" }, { origin: "code" });
    const entry = {
      download,
      finished: false,
      outputFile
    };
    this._downloads.push(entry);
    this._addLogEntry({ type: "download-start", wallTime: Date.now(), download: entry });
    await download.saveAs(entry.outputFile);
    entry.finished = true;
    this._addLogEntry({ type: "download-finish", wallTime: Date.now(), download: entry });
  }
  _clearCollectedArtifacts() {
    this._downloads.length = 0;
    this._requests.length = 0;
    this._recentEventEntries.length = 0;
    this._resetLogs();
  }
  _resetLogs() {
    const wallTime = Date.now();
    this._consoleLog.stop();
    this._consoleLog = new import_logFile.LogFile(this.context, wallTime, "console", "Console");
  }
  _handleRequest(request) {
    this._requests.push(request);
    const wallTime = request.timing().startTime || Date.now();
    this._addLogEntry({ type: "request", wallTime, request });
  }
  _handleResponse(response) {
    const timing = response.request().timing();
    const wallTime = timing.responseStart + timing.startTime;
    this._addLogEntry({ type: "request", wallTime, request: response.request() });
  }
  _handleRequestFailed(request) {
    this._requests.push(request);
    const timing = request.timing();
    const wallTime = timing.responseEnd + timing.startTime;
    this._addLogEntry({ type: "request", wallTime, request });
  }
  _handleConsoleMessage(message) {
    const wallTime = message.timestamp;
    this._addLogEntry({ type: "console", wallTime, message });
    if (shouldIncludeMessage(this.context.config.console?.level, message.type))
      this._consoleLog.appendLine(wallTime, message.toString());
  }
  _addLogEntry(entry) {
    this._recentEventEntries.push(entry);
  }
  _onClose() {
    this._clearCollectedArtifacts();
    this._onPageClose(this);
  }
  async headerSnapshot() {
    let title;
    await this._raceAgainstModalStates(async () => {
      title = await this.page.title();
    });
    const newHeader = {
      title: title ?? "",
      url: this.page.url(),
      current: this.isCurrentTab(),
      console: await this.consoleMessageCount()
    };
    if (!tabHeaderEquals(this._lastHeader, newHeader)) {
      this._lastHeader = newHeader;
      return { ...this._lastHeader, changed: true };
    }
    return { ...this._lastHeader, changed: false };
  }
  isCurrentTab() {
    return this === this.context.currentTab();
  }
  async waitForLoadState(state, options) {
    await this._initializedPromise;
    await this.page.waitForLoadState(state, options).catch((e) => (0, import_utilsBundle.debug)("pw:tools:error")(e));
  }
  async navigate(url2) {
    await this._initializedPromise;
    this._clearCollectedArtifacts();
    const { promise: downloadEvent, abort: abortDownloadEvent } = (0, import_utils.eventWaiter)(this.page, "download", 3e3);
    try {
      await this.page.goto(url2, { waitUntil: "domcontentloaded", ...this.navigationTimeoutOptions });
      abortDownloadEvent();
    } catch (_e) {
      const e = _e;
      const mightBeDownload = e.message.includes("net::ERR_ABORTED") || e.message.includes("Download is starting");
      if (!mightBeDownload)
        throw e;
      const download = await downloadEvent;
      if (!download)
        throw e;
      await new Promise((resolve) => setTimeout(resolve, 500));
      return;
    }
    await this.waitForLoadState("load", { timeout: 5e3 });
  }
  async consoleMessageCount() {
    await this._initializedPromise;
    const messages = await this.page.consoleMessages({ filter: "since-navigation" });
    const pageErrors = await this.page.pageErrors({ filter: "since-navigation" });
    let errors = pageErrors.length;
    let warnings = 0;
    for (const message of messages) {
      if (message.type() === "error")
        errors++;
      else if (message.type() === "warning")
        warnings++;
    }
    return { total: messages.length + pageErrors.length, errors, warnings };
  }
  async consoleMessages(level, all) {
    await this._initializedPromise;
    const result = [];
    const messages = await this.page.consoleMessages({ filter: all ? "all" : "since-navigation" });
    for (const message of messages) {
      const cm = messageToConsoleMessage(message);
      if (shouldIncludeMessage(level, cm.type))
        result.push(cm);
    }
    if (shouldIncludeMessage(level, "error")) {
      const errors = await this.page.pageErrors({ filter: all ? "all" : "since-navigation" });
      for (const error of errors)
        result.push(pageErrorToConsoleMessage(error));
    }
    return result;
  }
  async clearConsoleMessages() {
    await this._initializedPromise;
    await Promise.all([
      this.page.clearConsoleMessages(),
      this.page.clearPageErrors()
    ]);
  }
  async requests() {
    await this._initializedPromise;
    return this._requests;
  }
  async clearRequests() {
    await this._initializedPromise;
    this._requests.length = 0;
  }
  async captureSnapshot(selector, depth, relativeTo) {
    await this._initializedPromise;
    let tabSnapshot;
    const modalStates = await this._raceAgainstModalStates(async () => {
      const ariaSnapshot = selector ? await this.page.locator(selector).ariaSnapshot({ mode: "ai", depth }) : await this.page.ariaSnapshot({ mode: "ai", depth });
      tabSnapshot = {
        ariaSnapshot,
        modalStates: [],
        events: []
      };
    });
    if (tabSnapshot) {
      tabSnapshot.consoleLink = await this._consoleLog.take(relativeTo);
      tabSnapshot.events = this._recentEventEntries;
      this._recentEventEntries = [];
    }
    return tabSnapshot ?? {
      ariaSnapshot: "",
      modalStates,
      events: []
    };
  }
  _javaScriptBlocked() {
    return this._modalStates.some((state) => state.type === "dialog");
  }
  async _raceAgainstModalStates(action) {
    if (this.modalStates().length)
      return this.modalStates();
    const promise = new import_manualPromise.ManualPromise();
    const listener = (modalState) => promise.resolve([modalState]);
    this.once(TabEvents.modalState, listener);
    return await Promise.race([
      action().then(() => {
        this.off(TabEvents.modalState, listener);
        return [];
      }),
      promise
    ]);
  }
  async waitForCompletion(callback) {
    await this._initializedPromise;
    await this._raceAgainstModalStates(() => (0, import_utils.waitForCompletion)(this, callback));
  }
  async refLocator(params) {
    await this._initializedPromise;
    return (await this.refLocators([params]))[0];
  }
  async refLocators(params) {
    await this._initializedPromise;
    return Promise.all(params.map(async (param) => {
      if (param.selector) {
        const selector = (0, import_locatorParser.locatorOrSelectorAsSelector)("javascript", param.selector, this.context.config.testIdAttribute || "data-testid");
        const handle = await this.page.$(selector);
        if (!handle)
          throw new Error(`"${param.selector}" does not match any elements.`);
        handle.dispose().catch(() => {
        });
        return { locator: this.page.locator(selector), resolved: (0, import_locatorGenerators.asLocator)("javascript", selector) };
      } else {
        try {
          let locator = this.page.locator(`aria-ref=${param.ref}`);
          if (param.element)
            locator = locator.describe(param.element);
          const resolved = await locator.normalize();
          return { locator, resolved: resolved.toString() };
        } catch (e) {
          throw new Error(`Ref ${param.ref} not found in the current page snapshot. Try capturing new snapshot.`);
        }
      }
    }));
  }
  async waitForTimeout(time) {
    if (this._javaScriptBlocked()) {
      await new Promise((f) => setTimeout(f, time));
      return;
    }
    await this.page.evaluate(() => new Promise((f) => setTimeout(f, 1e3))).catch(() => {
    });
  }
}
function messageToConsoleMessage(message) {
  return {
    type: message.type(),
    timestamp: message.timestamp(),
    text: message.text(),
    toString: () => `[${message.type().toUpperCase()}] ${message.text()} @ ${message.location().url}:${message.location().lineNumber}`
  };
}
function pageErrorToConsoleMessage(errorOrValue) {
  if (errorOrValue instanceof Error) {
    return {
      type: "error",
      timestamp: Date.now(),
      text: errorOrValue.message,
      toString: () => errorOrValue.stack || errorOrValue.message
    };
  }
  return {
    type: "error",
    timestamp: Date.now(),
    text: String(errorOrValue),
    toString: () => String(errorOrValue)
  };
}
function renderModalStates(config, modalStates) {
  const result = [];
  if (modalStates.length === 0)
    result.push("- There is no modal state present");
  for (const state of modalStates)
    result.push(`- [${state.description}]: can be handled by ${config.skillMode ? state.clearedBy.skill : state.clearedBy.tool}`);
  return result;
}
const consoleMessageLevels = ["error", "warning", "info", "debug"];
function shouldIncludeMessage(thresholdLevel, type) {
  const messageLevel = consoleLevelForMessageType(type);
  return consoleMessageLevels.indexOf(messageLevel) <= consoleMessageLevels.indexOf(thresholdLevel || "info");
}
function consoleLevelForMessageType(type) {
  switch (type) {
    case "assert":
    case "error":
      return "error";
    case "warning":
      return "warning";
    case "count":
    case "dir":
    case "dirxml":
    case "info":
    case "log":
    case "table":
    case "time":
    case "timeEnd":
      return "info";
    case "clear":
    case "debug":
    case "endGroup":
    case "profile":
    case "profileEnd":
    case "startGroup":
    case "startGroupCollapsed":
    case "trace":
      return "debug";
    default:
      return "info";
  }
}
const tabSymbol = Symbol("tabSymbol");
function sanitizeForFilePath(s) {
  const sanitize = (s2) => s2.replace(/[\x00-\x2C\x2E-\x2F\x3A-\x40\x5B-\x60\x7B-\x7F]+/g, "-");
  const separator = s.lastIndexOf(".");
  if (separator === -1)
    return sanitize(s);
  return sanitize(s.substring(0, separator)) + "." + sanitize(s.substring(separator + 1));
}
function tabHeaderEquals(a, b) {
  return a.title === b.title && a.url === b.url && a.current === b.current && a.console.errors === b.console.errors && a.console.warnings === b.console.warnings && a.console.total === b.console.total;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Tab,
  renderModalStates,
  shouldIncludeMessage
});
