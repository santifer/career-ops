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
var dashboardController_exports = {};
__export(dashboardController_exports, {
  CDPConnection: () => CDPConnection,
  DashboardConnection: () => DashboardConnection
});
module.exports = __toCommonJS(dashboardController_exports);
var import_eventsHelper = require("../../server/utils/eventsHelper");
var import_connect = require("../utils/connect");
class DashboardConnection {
  constructor(browserDescriptor, cdpUrl, onclose) {
    this.version = 1;
    this.selectedPage = null;
    this._lastFrameData = null;
    this._lastViewportSize = null;
    this._pageListeners = [];
    this._contextListeners = [];
    this._eventListeners = /* @__PURE__ */ new Map();
    this._browserDescriptor = browserDescriptor;
    this._cdpUrl = cdpUrl;
    this._onclose = onclose;
  }
  on(event, listener) {
    let set = this._eventListeners.get(event);
    if (!set) {
      set = /* @__PURE__ */ new Set();
      this._eventListeners.set(event, set);
    }
    set.add(listener);
  }
  off(event, listener) {
    this._eventListeners.get(event)?.delete(listener);
  }
  _emit(event, params) {
    this.sendEvent?.(event, params);
    const set = this._eventListeners.get(event);
    if (set) {
      for (const fn of set)
        fn(params);
    }
  }
  onconnect() {
    this._initPromise = this._init();
    this._initPromise.catch(() => this.close?.());
  }
  async _init() {
    this._browser = await (0, import_connect.connectToBrowserAcrossVersions)(this._browserDescriptor);
    this._context = this._browser.contexts()[0];
    this._contextListeners.push(
      import_eventsHelper.eventsHelper.addEventListener(this._context, "page", (page) => {
        this._sendTabList();
        if (!this.selectedPage)
          this._selectPage(page);
      })
    );
    const pages = this._context.pages();
    if (pages.length > 0)
      this._selectPage(pages[0]);
    this._sendCachedState();
  }
  onclose() {
    this._deselectPage();
    this._contextListeners.forEach((d) => d.dispose());
    this._contextListeners = [];
    this._onclose();
    this._browser?.close().catch(() => {
    });
  }
  async dispatch(method, params) {
    await this._initPromise;
    return this[method]?.(params);
  }
  async selectTab(params) {
    const page = this._context.pages().find((p) => this._pageId(p) === params.pageId);
    if (page)
      await this._selectPage(page);
  }
  async closeTab(params) {
    const page = this._context.pages().find((p) => this._pageId(p) === params.pageId);
    if (page)
      await page.close({ reason: "Closed in Dashboard" });
  }
  async newTab() {
    const page = await this._context.newPage();
    await this._selectPage(page);
  }
  async navigate(params) {
    if (!this.selectedPage || !params.url)
      return;
    const page = this.selectedPage;
    await page.goto(params.url);
  }
  async back() {
    await this.selectedPage?.goBack();
  }
  async forward() {
    await this.selectedPage?.goForward();
  }
  async reload() {
    await this.selectedPage?.reload();
  }
  async mousemove(params) {
    await this.selectedPage?.mouse.move(params.x, params.y);
  }
  async mousedown(params) {
    await this.selectedPage?.mouse.move(params.x, params.y);
    await this.selectedPage?.mouse.down({ button: params.button || "left" });
  }
  async mouseup(params) {
    await this.selectedPage?.mouse.move(params.x, params.y);
    await this.selectedPage?.mouse.up({ button: params.button || "left" });
  }
  async wheel(params) {
    await this.selectedPage?.mouse.wheel(params.deltaX, params.deltaY);
  }
  async keydown(params) {
    await this.selectedPage?.keyboard.down(params.key);
  }
  async keyup(params) {
    await this.selectedPage?.keyboard.up(params.key);
  }
  async _selectPage(page) {
    if (this.selectedPage === page)
      return;
    if (this.selectedPage) {
      this._pageListeners.forEach((d) => d.dispose());
      this._pageListeners = [];
      await this.selectedPage.screencast.stop();
    }
    this.selectedPage = page;
    this._lastFrameData = null;
    this._lastViewportSize = null;
    this._sendTabList();
    this._pageListeners.push(
      import_eventsHelper.eventsHelper.addEventListener(page, "close", () => {
        this._deselectPage();
        const pages = page.context().pages();
        if (pages.length > 0)
          this._selectPage(pages[0]);
        this._sendTabList();
      }),
      import_eventsHelper.eventsHelper.addEventListener(page, "framenavigated", (frame) => {
        if (frame === page.mainFrame())
          this._sendTabList();
      })
    );
    const size = { width: 1280, height: 800 };
    await page.screencast.start({
      onFrame: ({ data }) => this._writeFrame(data, page.viewportSize()?.width ?? 0, page.viewportSize()?.height ?? 0),
      size
    });
  }
  _deselectPage() {
    if (!this.selectedPage)
      return;
    this._pageListeners.forEach((d) => d.dispose());
    this._pageListeners = [];
    this.selectedPage.screencast.stop().catch(() => {
    });
    this.selectedPage = null;
    this._lastFrameData = null;
    this._lastViewportSize = null;
  }
  async pickLocator() {
    if (!this.selectedPage)
      return;
    const locator = await this.selectedPage.pickLocator();
    this._emit("elementPicked", { selector: locator.toString() });
  }
  async cancelPickLocator() {
    await this.selectedPage?.cancelPickLocator();
  }
  _sendCachedState() {
    if (this._lastFrameData && this._lastViewportSize)
      this._emit("frame", { data: this._lastFrameData, viewportWidth: this._lastViewportSize.width, viewportHeight: this._lastViewportSize.height });
    this._sendTabList();
  }
  async tabs() {
    return { tabs: await this._tabList() };
  }
  async _tabList() {
    const pages = this._context.pages();
    if (pages.length === 0)
      return [];
    const devtoolsUrl = await this._devtoolsUrl(pages[0]);
    return await Promise.all(pages.map(async (page) => {
      const title = await page.title();
      return {
        pageId: this._pageId(page),
        title,
        url: page.url(),
        selected: page === this.selectedPage,
        inspectorUrl: devtoolsUrl ? await this._pageInspectorUrl(page, devtoolsUrl) : "data:text/plain,Dashboard only supported in Chromium based browsers"
      };
    }));
  }
  pageForId(pageId) {
    return this._context?.pages().find((p) => this._pageId(p) === pageId);
  }
  _pageId(p) {
    return p._guid;
  }
  async _devtoolsUrl(page) {
    const cdpPort = this._browserDescriptor.browser.launchOptions.cdpPort;
    if (cdpPort)
      return new URL(`http://localhost:${cdpPort}/devtools/`);
    const browserRevision = await getBrowserRevision(page);
    if (!browserRevision)
      return null;
    return new URL(`https://chrome-devtools-frontend.appspot.com/serve_rev/${browserRevision}/`);
  }
  async _pageInspectorUrl(page, devtoolsUrl) {
    const inspector = new URL("./devtools_app.html", devtoolsUrl);
    const cdp = new URL(this._cdpUrl);
    cdp.searchParams.set("cdpPageId", this._pageId(page));
    inspector.searchParams.set("ws", `${cdp.host}${cdp.pathname}${cdp.search}`);
    const url = inspector.toString();
    return url;
  }
  _sendTabList() {
    this._tabList().then((tabs) => this._emit("tabs", { tabs }));
  }
  _writeFrame(frame, viewportWidth, viewportHeight) {
    const data = frame.toString("base64");
    this._lastFrameData = data;
    this._lastViewportSize = { width: viewportWidth, height: viewportHeight };
    this._emit("frame", { data, viewportWidth, viewportHeight });
  }
}
async function getBrowserRevision(page) {
  try {
    const session = await page.context().newCDPSession(page);
    const version = await session.send("Browser.getVersion");
    await session.detach();
    return version.revision;
  } catch (error) {
    return null;
  }
}
class CDPConnection {
  constructor(page) {
    this._rawSession = null;
    this._rawSessionListeners = [];
    this._page = page;
  }
  onconnect() {
    this._initializePromise = this._initializeRawSession();
  }
  async dispatch(method, params) {
    await this._initializePromise;
    if (!this._rawSession)
      throw new Error("CDP session is not initialized");
    return await this._rawSession.send(method, params);
  }
  onclose() {
    this._rawSessionListeners.forEach((listener) => listener.dispose());
    this._rawSession?.detach().catch(() => {
    });
    this._rawSession = null;
    this._initializePromise = void 0;
  }
  async _initializeRawSession() {
    const session = await this._page.context().newCDPSession(this._page);
    this._rawSession = session;
    this._rawSessionListeners = [
      import_eventsHelper.eventsHelper.addEventListener(session, "event", ({ method, params }) => {
        this.sendEvent?.(method, params);
      }),
      import_eventsHelper.eventsHelper.addEventListener(session, "close", () => {
        this.close?.();
      })
    ];
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CDPConnection,
  DashboardConnection
});
