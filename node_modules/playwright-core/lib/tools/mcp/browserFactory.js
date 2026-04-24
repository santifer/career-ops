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
var browserFactory_exports = {};
__export(browserFactory_exports, {
  createBrowser: () => createBrowser,
  createBrowserWithInfo: () => createBrowserWithInfo,
  isProfileLocked: () => isProfileLocked
});
module.exports = __toCommonJS(browserFactory_exports);
var import_crypto = __toESM(require("crypto"));
var import_fs = __toESM(require("fs"));
var import_net = __toESM(require("net"));
var import_path = __toESM(require("path"));
var playwright = __toESM(require("../../.."));
var import_registry = require("../../server/registry/index");
var import_log = require("./log");
var import_context = require("../backend/context");
var import_extensionContextFactory = require("./extensionContextFactory");
var import_connect = require("../utils/connect");
var import_serverRegistry = require("../../serverRegistry");
var import_connect2 = require("../../client/connect");
async function createBrowser(config, clientInfo) {
  const { browser } = await createBrowserWithInfo(config, clientInfo);
  return browser;
}
async function createBrowserWithInfo(config, clientInfo) {
  if (config.browser.remoteEndpoint)
    return await createRemoteBrowser(config);
  let browser;
  if (config.browser.cdpEndpoint)
    browser = await createCDPBrowser(config, clientInfo);
  else if (config.browser.isolated)
    browser = await createIsolatedBrowser(config, clientInfo);
  else if (config.extension)
    browser = await (0, import_extensionContextFactory.createExtensionBrowser)(config, clientInfo);
  else
    browser = await createPersistentBrowser(config, clientInfo);
  return { browser, browserInfo: browserInfo(browser, config) };
}
function browserInfo(browser, config) {
  return {
    // eslint-disable-next-line no-restricted-syntax
    guid: browser._guid,
    browserName: config.browser.browserName,
    launchOptions: config.browser.launchOptions,
    userDataDir: config.browser.userDataDir
  };
}
async function createIsolatedBrowser(config, clientInfo) {
  (0, import_log.testDebug)("create browser (isolated)");
  await injectCdpPort(config.browser);
  const browserType = playwright[config.browser.browserName];
  const tracesDir = await computeTracesDir(config, clientInfo);
  const browser = await browserType.launch({
    tracesDir,
    ...config.browser.launchOptions,
    handleSIGINT: false,
    handleSIGTERM: false
  }).catch((error) => {
    if (error.message.includes("Executable doesn't exist"))
      throwBrowserIsNotInstalledError(config);
    throw error;
  });
  await startServer(browser, clientInfo);
  return browser;
}
async function createCDPBrowser(config, clientInfo) {
  (0, import_log.testDebug)("create browser (cdp)");
  const browser = await playwright.chromium.connectOverCDP(config.browser.cdpEndpoint, {
    headers: config.browser.cdpHeaders,
    timeout: config.browser.cdpTimeout
  });
  await startServer(browser, clientInfo);
  return browser;
}
async function createRemoteBrowser(config) {
  (0, import_log.testDebug)("create browser (remote)");
  const descriptor = await import_serverRegistry.serverRegistry.find(config.browser.remoteEndpoint);
  if (descriptor) {
    const browser2 = await (0, import_connect.connectToBrowserAcrossVersions)(descriptor);
    return {
      browser: browser2,
      browserInfo: {
        guid: descriptor.browser.guid,
        browserName: descriptor.browser.browserName,
        launchOptions: descriptor.browser.launchOptions,
        userDataDir: descriptor.browser.userDataDir
      }
    };
  }
  const endpoint = config.browser.remoteEndpoint;
  const playwrightObject = playwright;
  const browser = await (0, import_connect2.connectToBrowser)(playwrightObject, { endpoint });
  browser._connectToBrowserType(playwrightObject[browser._browserName], {}, void 0);
  return { browser, browserInfo: browserInfo(browser, config) };
}
async function createPersistentBrowser(config, clientInfo) {
  (0, import_log.testDebug)("create browser (persistent)");
  await injectCdpPort(config.browser);
  const userDataDir = config.browser.userDataDir ?? await createUserDataDir(config, clientInfo);
  const tracesDir = await computeTracesDir(config, clientInfo);
  if (await isProfileLocked5Times(userDataDir))
    throw new Error(`Browser is already in use for ${userDataDir}, use --isolated to run multiple instances of the same browser`);
  const browserType = playwright[config.browser.browserName];
  const launchOptions = {
    tracesDir,
    ...config.browser.launchOptions,
    ...config.browser.contextOptions,
    handleSIGINT: false,
    handleSIGTERM: false,
    ignoreDefaultArgs: [
      "--disable-extensions"
    ]
  };
  try {
    const browserContext = await browserType.launchPersistentContext(userDataDir, launchOptions);
    const browser = browserContext.browser();
    await startServer(browser, clientInfo);
    return browser;
  } catch (error) {
    if (error.message.includes("Executable doesn't exist"))
      throwBrowserIsNotInstalledError(config);
    if (error.message.includes("cannot open shared object file: No such file or directory")) {
      const browserName = launchOptions.channel ?? config.browser.browserName;
      throw new Error(`Missing system dependencies required to run browser ${browserName}. Install them with: sudo npx playwright install-deps ${browserName}`);
    }
    if (error.message.includes("ProcessSingleton") || error.message.includes("exitCode=21"))
      throw new Error(`Browser is already in use for ${userDataDir}, use --isolated to run multiple instances of the same browser`);
    throw error;
  }
}
async function createUserDataDir(config, clientInfo) {
  const dir = process.env.PWMCP_PROFILES_DIR_FOR_TEST ?? import_registry.registryDirectory;
  const browserToken = config.browser.launchOptions?.channel ?? config.browser?.browserName;
  const rootPathToken = createHash(clientInfo.cwd);
  const result = import_path.default.join(dir, `mcp-${browserToken}-${rootPathToken}`);
  await import_fs.default.promises.mkdir(result, { recursive: true });
  return result;
}
async function injectCdpPort(browserConfig) {
  if (browserConfig.browserName === "chromium")
    browserConfig.launchOptions.cdpPort = await findFreePort();
}
async function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = import_net.default.createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}
function createHash(data) {
  return import_crypto.default.createHash("sha256").update(data).digest("hex").slice(0, 7);
}
async function computeTracesDir(config, clientInfo) {
  return import_path.default.resolve((0, import_context.outputDir)({ config, cwd: clientInfo.cwd }), "traces");
}
async function isProfileLocked5Times(userDataDir) {
  for (let i = 0; i < 5; i++) {
    if (!isProfileLocked(userDataDir))
      return false;
    await new Promise((f) => setTimeout(f, 1e3));
  }
  return true;
}
function isProfileLocked(userDataDir) {
  const lockFile = process.platform === "win32" ? "lockfile" : "SingletonLock";
  const lockPath = import_path.default.join(userDataDir, lockFile);
  if (process.platform === "win32") {
    try {
      const fd = import_fs.default.openSync(lockPath, "r+");
      import_fs.default.closeSync(fd);
      return false;
    } catch (e) {
      return e.code !== "ENOENT";
    }
  }
  try {
    const target = import_fs.default.readlinkSync(lockPath);
    const pid = parseInt(target.split("-").pop() || "", 10);
    if (isNaN(pid))
      return false;
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
function throwBrowserIsNotInstalledError(config) {
  const channel = config.browser.launchOptions?.channel ?? config.browser.browserName;
  if (config.skillMode)
    throw new Error(`Browser "${channel}" is not installed. Run \`playwright-cli install-browser ${channel}\` to install`);
  else
    throw new Error(`Browser "${channel}" is not installed. Run \`npx @playwright/mcp install-browser ${channel}\` to install`);
}
async function startServer(browser, clientInfo) {
  if (clientInfo.sessionName)
    await browser.bind(clientInfo.sessionName, { workspaceDir: clientInfo.workspaceDir });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createBrowser,
  createBrowserWithInfo,
  isProfileLocked
});
