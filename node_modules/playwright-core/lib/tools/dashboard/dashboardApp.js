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
var dashboardApp_exports = {};
__export(dashboardApp_exports, {
  syncLocalStorageWithSettings: () => syncLocalStorageWithSettings
});
module.exports = __toCommonJS(dashboardApp_exports);
var import_fs = __toESM(require("fs"));
var import_path = __toESM(require("path"));
var import_net = __toESM(require("net"));
var import__ = require("../../..");
var import_httpServer = require("../../server/utils/httpServer");
var import_fileUtils = require("../../server/utils/fileUtils");
var import_processLauncher = require("../../server/utils/processLauncher");
var import_registry = require("../../server/registry/index");
var import_dashboardController = require("./dashboardController");
var import_serverRegistry = require("../../serverRegistry");
var import_connect = require("../utils/connect");
function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString();
        resolve(text ? JSON.parse(text) : {});
      } catch (e) {
        reject(e);
      }
    });
    request.on("error", reject);
  });
}
async function parseRequest(request) {
  const body = await readBody(request);
  if (!body.guid)
    throw new Error("Dashboard app is too old, please close it and open again");
  return { guid: body.guid };
}
function sendJSON(response, data, statusCode = 200) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(data));
}
async function loadBrowserDescriptorSessions(wsPath) {
  const entriesByWorkspace = await import_serverRegistry.serverRegistry.list();
  const sessions = [];
  for (const [, entries] of entriesByWorkspace) {
    for (const entry of entries) {
      let wsUrl;
      if (entry.canConnect) {
        const url = new URL(wsPath, "http://localhost");
        url.searchParams.set("guid", entry.browser.guid);
        wsUrl = url.pathname + url.search;
      }
      sessions.push({ ...entry, wsUrl });
    }
  }
  return sessions;
}
const browserGuidToDashboardConnection = /* @__PURE__ */ new Map();
async function handleApiRequest(httpServer, request, response) {
  const url = new URL(request.url, httpServer.urlPrefix("human-readable"));
  const apiPath = url.pathname;
  if (apiPath === "/api/sessions/list" && request.method === "GET") {
    const sessions = await loadBrowserDescriptorSessions(httpServer.wsGuid());
    sendJSON(response, { sessions });
    return;
  }
  if (apiPath === "/api/sessions/close" && request.method === "POST") {
    const { guid } = await parseRequest(request);
    let browser;
    try {
      const browserDescriptor = import_serverRegistry.serverRegistry.readDescriptor(guid);
      browser = await (0, import_connect.connectToBrowserAcrossVersions)(browserDescriptor);
    } catch (e) {
      sendJSON(response, { error: "Failed to connect to browser socket: " + e.message }, 500);
      return;
    }
    try {
      await Promise.all(browser.contexts().map((context) => context.close()));
      await browser.close();
      sendJSON(response, { success: true });
      return;
    } catch (e) {
      sendJSON(response, { error: "Failed to close browser: " + e.message }, 500);
      return;
    }
  }
  if (apiPath === "/api/sessions/delete-data" && request.method === "POST") {
    const { guid } = await parseRequest(request);
    try {
      await import_serverRegistry.serverRegistry.deleteUserData(guid);
    } catch (e) {
      sendJSON(response, { error: "Failed to delete session data: " + e.message }, 500);
      return;
    }
    sendJSON(response, { success: true });
    return;
  }
  response.statusCode = 404;
  response.end(JSON.stringify({ error: "Not found" }));
}
async function openDashboardApp() {
  const httpServer = new import_httpServer.HttpServer();
  const libDir = require.resolve("playwright-core/package.json");
  const dashboardDir = import_path.default.join(import_path.default.dirname(libDir), "lib/vite/dashboard");
  httpServer.routePrefix("/api/", (request, response) => {
    handleApiRequest(httpServer, request, response).catch((e) => {
      response.statusCode = 500;
      response.end(JSON.stringify({ error: e.message }));
    });
    return true;
  });
  httpServer.createWebSocket((url2) => {
    const guid = url2.searchParams.get("guid");
    if (!guid)
      throw new Error("Unsupported WebSocket URL: " + url2.toString());
    const browserDescriptor = import_serverRegistry.serverRegistry.readDescriptor(guid);
    const cdpPageId = url2.searchParams.get("cdpPageId");
    if (cdpPageId) {
      const connection2 = browserGuidToDashboardConnection.get(guid);
      if (!connection2)
        throw new Error("CDP connection not found for session: " + guid);
      const page2 = connection2.pageForId(cdpPageId);
      if (!page2)
        throw new Error("Page not found for page ID: " + cdpPageId);
      return new import_dashboardController.CDPConnection(page2);
    }
    const cdpUrl = new URL(httpServer.urlPrefix("human-readable"));
    cdpUrl.pathname = httpServer.wsGuid();
    cdpUrl.searchParams.set("guid", guid);
    const connection = new import_dashboardController.DashboardConnection(browserDescriptor, cdpUrl, () => browserGuidToDashboardConnection.delete(guid));
    browserGuidToDashboardConnection.set(guid, connection);
    return connection;
  });
  httpServer.routePrefix("/", (request, response) => {
    const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
    const filePath = pathname === "/" ? "index.html" : pathname.substring(1);
    const resolved = import_path.default.join(dashboardDir, filePath);
    if (!resolved.startsWith(dashboardDir))
      return false;
    return httpServer.serveFile(request, response, resolved);
  });
  await httpServer.start();
  const url = httpServer.urlPrefix("human-readable");
  const { page } = await launchApp("dashboard");
  await page.goto(url);
  return page;
}
async function launchApp(appName) {
  const channel = (0, import_registry.findChromiumChannelBestEffort)("javascript");
  const debugPort = parseInt(process.env.PLAYWRIGHT_DASHBOARD_DEBUG_PORT, 10) || void 0;
  const context = await import__.chromium.launchPersistentContext("", {
    ignoreDefaultArgs: ["--enable-automation"],
    channel,
    headless: debugPort !== void 0,
    args: [
      "--app=data:text/html,",
      "--test-type=",
      `--window-size=1280,800`,
      `--window-position=100,100`,
      ...debugPort !== void 0 ? [`--remote-debugging-port=${debugPort}`] : []
    ],
    viewport: null
  });
  const [page] = context.pages();
  if (process.platform === "darwin") {
    context.on("page", async (newPage) => {
      if (newPage.mainFrame().url() === "chrome://new-tab-page/") {
        await page.bringToFront();
        await newPage.close();
      }
    });
  }
  page.on("close", () => {
    (0, import_processLauncher.gracefullyProcessExitDoNotHang)(0);
  });
  const image = await import_fs.default.promises.readFile(import_path.default.join(__dirname, "appIcon.png"));
  await page._setDockTile?.(image);
  await syncLocalStorageWithSettings(page, appName);
  return { context, page };
}
async function syncLocalStorageWithSettings(page, appName) {
  const settingsFile = import_path.default.join(import_registry.registryDirectory, ".settings", `${appName}.json`);
  await page.exposeBinding("_saveSerializedSettings", (_, settings2) => {
    import_fs.default.mkdirSync(import_path.default.dirname(settingsFile), { recursive: true });
    import_fs.default.writeFileSync(settingsFile, settings2);
  });
  const settings = await import_fs.default.promises.readFile(settingsFile, "utf-8").catch(() => "{}");
  await page.addInitScript(
    `(${String((settings2) => {
      if (location && location.protocol === "data:")
        return;
      if (window.top !== window)
        return;
      Object.entries(settings2).map(([k, v]) => localStorage[k] = v);
      window.saveSettings = () => {
        window._saveSerializedSettings(JSON.stringify({ ...localStorage }));
      };
    })})(${settings});
  `
  );
}
function dashboardSocketPath() {
  return (0, import_fileUtils.makeSocketPath)("dashboard", "app");
}
async function acquireSingleton() {
  const socketPath = dashboardSocketPath();
  if (process.platform !== "win32")
    await import_fs.default.promises.mkdir(import_path.default.dirname(socketPath), { recursive: true });
  return await new Promise((resolve, reject) => {
    const server = import_net.default.createServer();
    server.listen(socketPath, () => resolve(server));
    server.on("error", (err) => {
      if (err.code !== "EADDRINUSE")
        return reject(err);
      const client = import_net.default.connect(socketPath, () => {
        client.write("bringToFront");
        client.end();
        reject(new Error("already running"));
      });
      client.on("error", () => {
        if (process.platform !== "win32")
          import_fs.default.unlinkSync(socketPath);
        server.listen(socketPath, () => resolve(server));
      });
    });
  });
}
async function main() {
  let server;
  process.on("exit", () => server?.close());
  const underTest = !!process.env.PLAYWRIGHT_DASHBOARD_DEBUG_PORT;
  if (!underTest) {
    try {
      server = await acquireSingleton();
    } catch {
      return;
    }
  }
  const page = await openDashboardApp();
  server?.on("connection", (socket) => {
    socket.on("data", (data) => {
      if (data.toString() === "bringToFront")
        page?.bringToFront().catch(() => {
        });
    });
  });
}
process.on("unhandledRejection", (error) => {
  console.error("Unhandled promise rejection:", error);
});
void main();
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  syncLocalStorageWithSettings
});
