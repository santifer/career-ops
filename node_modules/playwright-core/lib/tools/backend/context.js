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
var context_exports = {};
__export(context_exports, {
  Context: () => Context,
  outputDir: () => outputDir,
  outputFile: () => outputFile,
  workspaceFile: () => workspaceFile
});
module.exports = __toCommonJS(context_exports);
var import_fs = __toESM(require("fs"));
var import_path = __toESM(require("path"));
var import_utilsBundle = require("../../utilsBundle");
var import_stringUtils = require("../../utils/isomorphic/stringUtils");
var import__ = require("../../..");
var import_tab = require("./tab");
var import_disposable = require("../../server/utils/disposable");
var import_eventsHelper = require("../../server/utils/eventsHelper");
const testDebug = (0, import_utilsBundle.debug)("pw:mcp:test");
class Context {
  constructor(browserContext, options) {
    this._tabs = [];
    this._routes = [];
    this._disposables = [];
    this.config = options.config;
    this.sessionLog = options.sessionLog;
    this.options = options;
    this._rawBrowserContext = browserContext;
    testDebug("create context");
  }
  async dispose() {
    await (0, import_disposable.disposeAll)(this._disposables);
    for (const tab of this._tabs)
      await tab.dispose();
    this._tabs.length = 0;
    this._currentTab = void 0;
    await this.stopVideoRecording();
  }
  debugger() {
    return this._rawBrowserContext.debugger;
  }
  tabs() {
    return this._tabs;
  }
  currentTab() {
    return this._currentTab;
  }
  currentTabOrDie() {
    if (!this._currentTab)
      throw new Error("No open pages available.");
    return this._currentTab;
  }
  async newTab() {
    const browserContext = await this.ensureBrowserContext();
    const page = await browserContext.newPage();
    this._currentTab = this._tabs.find((t) => t.page === page);
    return this._currentTab;
  }
  async selectTab(index) {
    const tab = this._tabs[index];
    if (!tab)
      throw new Error(`Tab ${index} not found`);
    await tab.page.bringToFront();
    this._currentTab = tab;
    return tab;
  }
  async ensureTab() {
    const browserContext = await this.ensureBrowserContext();
    if (!this._currentTab)
      await browserContext.newPage();
    return this._currentTab;
  }
  async closeTab(index) {
    const tab = index === void 0 ? this._currentTab : this._tabs[index];
    if (!tab)
      throw new Error(`Tab ${index} not found`);
    const url = tab.page.url();
    await tab.page.close();
    return url;
  }
  async workspaceFile(fileName, perCallWorkspaceDir) {
    return await workspaceFile(this.options, fileName, perCallWorkspaceDir);
  }
  async outputFile(template, options) {
    const baseName = template.suggestedFilename || `${template.prefix}-${(template.date ?? /* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-")}${template.ext ? "." + template.ext : ""}`;
    return await outputFile(this.options, baseName, options);
  }
  async startVideoRecording(fileName, params) {
    if (this._video)
      throw new Error("Video recording has already been started.");
    this._video = { params, fileName, fileNames: [] };
    const browserContext = await this.ensureBrowserContext();
    for (const page of browserContext.pages())
      await this._startPageVideo(page);
  }
  async stopVideoRecording() {
    if (!this._video)
      return [];
    const video = this._video;
    for (const page of this._rawBrowserContext.pages())
      await page.screencast.stop();
    this._video = void 0;
    return [...video.fileNames];
  }
  async _startPageVideo(page) {
    if (!this._video)
      return;
    const suffix = this._video.fileNames.length ? `-${this._video.fileNames.length}` : "";
    let fileName = this._video.fileName;
    if (fileName && suffix) {
      const ext = import_path.default.extname(fileName);
      fileName = import_path.default.basename(fileName, ext) + suffix + ext;
    }
    this._video.fileNames.push(fileName);
    await page.screencast.start({ path: fileName, ...this._video.params });
  }
  _onPageCreated(page) {
    const tab = new import_tab.Tab(this, page, (tab2) => this._onPageClosed(tab2));
    this._tabs.push(tab);
    if (!this._currentTab)
      this._currentTab = tab;
    this._startPageVideo(page).catch(() => {
    });
  }
  _onPageClosed(tab) {
    const index = this._tabs.indexOf(tab);
    if (index === -1)
      return;
    this._tabs.splice(index, 1);
    if (this._currentTab === tab)
      this._currentTab = this._tabs[Math.min(index, this._tabs.length - 1)];
  }
  routes() {
    return this._routes;
  }
  async addRoute(entry) {
    const browserContext = await this.ensureBrowserContext();
    await browserContext.route(entry.pattern, entry.handler);
    this._routes.push(entry);
  }
  async removeRoute(pattern) {
    let removed = 0;
    const browserContext = await this.ensureBrowserContext();
    if (pattern) {
      const toRemove = this._routes.filter((r) => r.pattern === pattern);
      for (const route of toRemove)
        await browserContext.unroute(route.pattern, route.handler);
      this._routes = this._routes.filter((r) => r.pattern !== pattern);
      removed = toRemove.length;
    } else {
      for (const route of this._routes)
        await browserContext.unroute(route.pattern, route.handler);
      removed = this._routes.length;
      this._routes = [];
    }
    return removed;
  }
  isRunningTool() {
    return this._runningToolName !== void 0;
  }
  setRunningTool(name) {
    this._runningToolName = name;
  }
  async _setupRequestInterception(context) {
    if (this.config.network?.allowedOrigins?.length) {
      this._disposables.push(await context.route("**", (route) => route.abort("blockedbyclient")));
      for (const origin of this.config.network.allowedOrigins) {
        const glob = originOrHostGlob(origin);
        this._disposables.push(await context.route(glob, (route) => route.continue()));
      }
    }
    if (this.config.network?.blockedOrigins?.length) {
      for (const origin of this.config.network.blockedOrigins)
        this._disposables.push(await context.route(originOrHostGlob(origin), (route) => route.abort("blockedbyclient")));
    }
  }
  async ensureBrowserContext() {
    if (this._browserContextPromise)
      return this._browserContextPromise;
    this._browserContextPromise = this._initializeBrowserContext();
    return this._browserContextPromise;
  }
  async _initializeBrowserContext() {
    if (this.config.testIdAttribute)
      import__.selectors.setTestIdAttribute(this.config.testIdAttribute);
    const browserContext = this._rawBrowserContext;
    await this._setupRequestInterception(browserContext);
    if (this.config.saveTrace) {
      await browserContext.tracing.start({
        name: "trace-" + Date.now(),
        screenshots: true,
        snapshots: true,
        live: true
      });
      this._disposables.push({
        dispose: async () => {
          await browserContext.tracing.stop();
        }
      });
    }
    for (const initScript of this.config.browser?.initScript || [])
      this._disposables.push(await browserContext.addInitScript({ path: import_path.default.resolve(this.options.cwd, initScript) }));
    for (const page of browserContext.pages())
      this._onPageCreated(page);
    this._disposables.push(import_eventsHelper.eventsHelper.addEventListener(browserContext, "page", (page) => this._onPageCreated(page)));
    return browserContext;
  }
  checkUrlAllowed(url) {
    if (this.config.allowUnrestrictedFileAccess)
      return;
    if (!URL.canParse(url))
      return;
    if (new URL(url).protocol === "file:")
      throw new Error(`Access to "file:" protocol is blocked. Attempted URL: "${url}"`);
  }
  lookupSecret(secretName) {
    if (!this.config.secrets?.[secretName])
      return { value: secretName, code: (0, import_stringUtils.escapeWithQuotes)(secretName, "'") };
    return {
      value: this.config.secrets[secretName],
      code: `process.env['${secretName}']`
    };
  }
}
function originOrHostGlob(originOrHost) {
  const wildcardPortMatch = originOrHost.match(/^(https?:\/\/[^/:]+):\*$/);
  if (wildcardPortMatch)
    return `${wildcardPortMatch[1]}:*/**`;
  try {
    const url = new URL(originOrHost);
    if (url.origin !== "null")
      return `${url.origin}/**`;
  } catch {
  }
  return `*://${originOrHost}/**`;
}
async function workspaceFile(options, fileName, perCallWorkspaceDir) {
  const workspace = perCallWorkspaceDir ?? options.cwd;
  const resolvedName = import_path.default.resolve(workspace, fileName);
  await checkFile(options, resolvedName, { origin: "llm" });
  return resolvedName;
}
function outputDir(options) {
  if (options.config.outputDir)
    return import_path.default.resolve(options.config.outputDir);
  return import_path.default.resolve(options.cwd, options.config.skillMode ? ".playwright-cli" : ".playwright-mcp");
}
async function outputFile(options, fileName, flags) {
  const resolvedFile = import_path.default.resolve(outputDir(options), fileName);
  await checkFile(options, resolvedFile, flags);
  await import_fs.default.promises.mkdir(import_path.default.dirname(resolvedFile), { recursive: true });
  (0, import_utilsBundle.debug)("pw:mcp:file")(resolvedFile);
  return resolvedFile;
}
async function checkFile(options, resolvedFilename, flags) {
  if (flags.origin === "code" || options.config.allowUnrestrictedFileAccess)
    return;
  const output = outputDir(options);
  const workspace = options.cwd;
  const withinDir = (root) => resolvedFilename === root || resolvedFilename.startsWith(root + import_path.default.sep);
  if (!withinDir(output) && !withinDir(workspace))
    throw new Error(`File access denied: ${resolvedFilename} is outside allowed roots. Allowed roots: ${output}, ${workspace}`);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Context,
  outputDir,
  outputFile,
  workspaceFile
});
