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
var browserActions_exports = {};
__export(browserActions_exports, {
  codegen: () => codegen,
  open: () => open,
  pdf: () => pdf,
  screenshot: () => screenshot
});
module.exports = __toCommonJS(browserActions_exports);
var import_fs = __toESM(require("fs"));
var import_os = __toESM(require("os"));
var import_path = __toESM(require("path"));
var playwright = __toESM(require("../.."));
var import_utils = require("../utils");
var import_utilsBundle = require("../utilsBundle");
async function launchContext(options, extraOptions) {
  validateOptions(options);
  const browserType = lookupBrowserType(options);
  const launchOptions = extraOptions;
  if (options.channel)
    launchOptions.channel = options.channel;
  launchOptions.handleSIGINT = false;
  const contextOptions = (
    // Copy the device descriptor since we have to compare and modify the options.
    options.device ? { ...playwright.devices[options.device] } : {}
  );
  if (!extraOptions.headless)
    contextOptions.deviceScaleFactor = import_os.default.platform() === "darwin" ? 2 : 1;
  if (browserType.name() === "webkit" && process.platform === "linux") {
    delete contextOptions.hasTouch;
    delete contextOptions.isMobile;
  }
  if (contextOptions.isMobile && browserType.name() === "firefox")
    contextOptions.isMobile = void 0;
  if (options.blockServiceWorkers)
    contextOptions.serviceWorkers = "block";
  if (options.proxyServer) {
    launchOptions.proxy = {
      server: options.proxyServer
    };
    if (options.proxyBypass)
      launchOptions.proxy.bypass = options.proxyBypass;
  }
  if (options.viewportSize) {
    try {
      const [width, height] = options.viewportSize.split(",").map((n) => +n);
      if (isNaN(width) || isNaN(height))
        throw new Error("bad values");
      contextOptions.viewport = { width, height };
    } catch (e) {
      throw new Error('Invalid viewport size format: use "width,height", for example --viewport-size="800,600"');
    }
  }
  if (options.geolocation) {
    try {
      const [latitude, longitude] = options.geolocation.split(",").map((n) => parseFloat(n.trim()));
      contextOptions.geolocation = {
        latitude,
        longitude
      };
    } catch (e) {
      throw new Error('Invalid geolocation format, should be "lat,long". For example --geolocation="37.819722,-122.478611"');
    }
    contextOptions.permissions = ["geolocation"];
  }
  if (options.userAgent)
    contextOptions.userAgent = options.userAgent;
  if (options.lang)
    contextOptions.locale = options.lang;
  if (options.colorScheme)
    contextOptions.colorScheme = options.colorScheme;
  if (options.timezone)
    contextOptions.timezoneId = options.timezone;
  if (options.loadStorage)
    contextOptions.storageState = options.loadStorage;
  if (options.ignoreHttpsErrors)
    contextOptions.ignoreHTTPSErrors = true;
  if (options.saveHar) {
    contextOptions.recordHar = { path: import_path.default.resolve(process.cwd(), options.saveHar), mode: "minimal" };
    if (options.saveHarGlob)
      contextOptions.recordHar.urlFilter = options.saveHarGlob;
    contextOptions.serviceWorkers = "block";
  }
  let browser;
  let context;
  if (options.userDataDir) {
    context = await browserType.launchPersistentContext(options.userDataDir, { ...launchOptions, ...contextOptions });
    browser = context.browser();
  } else {
    browser = await browserType.launch(launchOptions);
    context = await browser.newContext(contextOptions);
  }
  let closingBrowser = false;
  async function closeBrowser() {
    if (closingBrowser)
      return;
    closingBrowser = true;
    if (options.saveStorage)
      await context.storageState({ path: options.saveStorage }).catch((e) => null);
    if (options.saveHar)
      await context.close();
    await browser.close();
  }
  context.on("page", (page) => {
    page.on("dialog", () => {
    });
    page.on("close", () => {
      const hasPage = browser.contexts().some((context2) => context2.pages().length > 0);
      if (hasPage)
        return;
      closeBrowser().catch(() => {
      });
    });
  });
  process.on("SIGINT", async () => {
    await closeBrowser();
    (0, import_utils.gracefullyProcessExitDoNotHang)(130);
  });
  const timeout = options.timeout ? parseInt(options.timeout, 10) : 0;
  context.setDefaultTimeout(timeout);
  context.setDefaultNavigationTimeout(timeout);
  delete launchOptions.headless;
  delete launchOptions.executablePath;
  delete launchOptions.handleSIGINT;
  delete contextOptions.deviceScaleFactor;
  return { browser, browserName: browserType.name(), context, contextOptions, launchOptions, closeBrowser };
}
async function openPage(context, url) {
  let page = context.pages()[0];
  if (!page)
    page = await context.newPage();
  if (url) {
    if (import_fs.default.existsSync(url))
      url = "file://" + import_path.default.resolve(url);
    else if (!url.startsWith("http") && !url.startsWith("file://") && !url.startsWith("about:") && !url.startsWith("data:"))
      url = "http://" + url;
    await page.goto(url);
  }
  return page;
}
async function open(options, url) {
  const { context } = await launchContext(options, { headless: !!process.env.PWTEST_CLI_HEADLESS, executablePath: process.env.PWTEST_CLI_EXECUTABLE_PATH });
  await context._exposeConsoleApi();
  await openPage(context, url);
}
async function codegen(options, url) {
  const { target: language, output: outputFile, testIdAttribute: testIdAttributeName } = options;
  const tracesDir = import_path.default.join(import_os.default.tmpdir(), `playwright-recorder-trace-${Date.now()}`);
  const { context, browser, launchOptions, contextOptions, closeBrowser } = await launchContext(options, {
    headless: !!process.env.PWTEST_CLI_HEADLESS,
    executablePath: process.env.PWTEST_CLI_EXECUTABLE_PATH,
    tracesDir
  });
  const donePromise = new import_utils.ManualPromise();
  maybeSetupTestHooks(browser, closeBrowser, donePromise);
  import_utilsBundle.dotenv.config({ path: "playwright.env" });
  await context._enableRecorder({
    language,
    launchOptions,
    contextOptions,
    device: options.device,
    saveStorage: options.saveStorage,
    mode: "recording",
    testIdAttributeName,
    outputFile: outputFile ? import_path.default.resolve(outputFile) : void 0,
    handleSIGINT: false
  });
  await openPage(context, url);
  donePromise.resolve();
}
async function maybeSetupTestHooks(browser, closeBrowser, donePromise) {
  if (!process.env.PWTEST_CLI_IS_UNDER_TEST)
    return;
  const logs = [];
  require("playwright-core/lib/utilsBundle").debug.log = (...args) => {
    const line = require("util").format(...args) + "\n";
    logs.push(line);
    process.stderr.write(line);
  };
  browser.on("disconnected", () => {
    const hasCrashLine = logs.some((line) => line.includes("process did exit:") && !line.includes("process did exit: exitCode=0, signal=null"));
    if (hasCrashLine) {
      process.stderr.write("Detected browser crash.\n");
      (0, import_utils.gracefullyProcessExitDoNotHang)(1);
    }
  });
  const close = async () => {
    await donePromise;
    await closeBrowser();
  };
  if (process.env.PWTEST_CLI_EXIT_AFTER_TIMEOUT) {
    setTimeout(close, +process.env.PWTEST_CLI_EXIT_AFTER_TIMEOUT);
    return;
  }
  let stdin = "";
  process.stdin.on("data", (data) => {
    stdin += data.toString();
    if (stdin.startsWith("exit")) {
      process.stdin.destroy();
      close();
    }
  });
}
async function waitForPage(page, captureOptions) {
  if (captureOptions.waitForSelector) {
    console.log(`Waiting for selector ${captureOptions.waitForSelector}...`);
    await page.waitForSelector(captureOptions.waitForSelector);
  }
  if (captureOptions.waitForTimeout) {
    console.log(`Waiting for timeout ${captureOptions.waitForTimeout}...`);
    await page.waitForTimeout(parseInt(captureOptions.waitForTimeout, 10));
  }
}
async function screenshot(options, captureOptions, url, path2) {
  const { context } = await launchContext(options, { headless: true });
  console.log("Navigating to " + url);
  const page = await openPage(context, url);
  await waitForPage(page, captureOptions);
  console.log("Capturing screenshot into " + path2);
  await page.screenshot({ path: path2, fullPage: !!captureOptions.fullPage });
  await page.close();
}
async function pdf(options, captureOptions, url, path2) {
  if (options.browser !== "chromium")
    throw new Error("PDF creation is only working with Chromium");
  const { context } = await launchContext({ ...options, browser: "chromium" }, { headless: true });
  console.log("Navigating to " + url);
  const page = await openPage(context, url);
  await waitForPage(page, captureOptions);
  console.log("Saving as pdf into " + path2);
  await page.pdf({ path: path2, format: captureOptions.paperFormat });
  await page.close();
}
function lookupBrowserType(options) {
  let name = options.browser;
  if (options.device) {
    const device = playwright.devices[options.device];
    name = device.defaultBrowserType;
  }
  let browserType;
  switch (name) {
    case "chromium":
      browserType = playwright.chromium;
      break;
    case "webkit":
      browserType = playwright.webkit;
      break;
    case "firefox":
      browserType = playwright.firefox;
      break;
    case "cr":
      browserType = playwright.chromium;
      break;
    case "wk":
      browserType = playwright.webkit;
      break;
    case "ff":
      browserType = playwright.firefox;
      break;
  }
  if (browserType)
    return browserType;
  import_utilsBundle.program.help();
}
function validateOptions(options) {
  if (options.device && !(options.device in playwright.devices)) {
    const lines = [`Device descriptor not found: '${options.device}', available devices are:`];
    for (const name in playwright.devices)
      lines.push(`  "${name}"`);
    throw new Error(lines.join("\n"));
  }
  if (options.colorScheme && !["light", "dark"].includes(options.colorScheme))
    throw new Error('Invalid color scheme, should be one of "light", "dark"');
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  codegen,
  open,
  pdf,
  screenshot
});
