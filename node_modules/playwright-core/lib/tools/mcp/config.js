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
var config_exports = {};
__export(config_exports, {
  commaSeparatedList: () => commaSeparatedList,
  configFromEnv: () => configFromEnv,
  dotenvFileLoader: () => dotenvFileLoader,
  enumParser: () => enumParser,
  headerParser: () => headerParser,
  loadConfig: () => loadConfig,
  numberParser: () => numberParser,
  resolutionParser: () => resolutionParser,
  resolveCLIConfigForCLI: () => resolveCLIConfigForCLI,
  resolveCLIConfigForMCP: () => resolveCLIConfigForMCP,
  resolveConfig: () => resolveConfig,
  semicolonSeparatedList: () => semicolonSeparatedList
});
module.exports = __toCommonJS(config_exports);
var import_fs = __toESM(require("fs"));
var import_path = __toESM(require("path"));
var import_os = __toESM(require("os"));
var import__ = require("../../..");
var import_utilsBundle = require("../../utilsBundle");
var import_configIni = require("./configIni");
async function fileExistsAsync(resolved) {
  try {
    return (await import_fs.default.promises.stat(resolved)).isFile();
  } catch {
    return false;
  }
}
const defaultConfig = {
  browser: {
    launchOptions: {},
    contextOptions: {}
  },
  timeouts: {
    action: 5e3,
    navigation: 6e4,
    expect: 5e3
  }
};
async function resolveConfig(config) {
  const merged = mergeConfig(defaultConfig, config);
  const browser = await validateBrowserConfig(merged.browser);
  return { ...merged, browser };
}
async function resolveCLIConfigForMCP(cliOptions, env) {
  const envOverrides = configFromEnv(env);
  const cliOverrides = configFromCLIOptions(cliOptions);
  const configFile = cliOverrides.configFile ?? envOverrides.configFile;
  const configInFile = await loadConfig(configFile);
  let result = defaultConfig;
  result = mergeConfig(result, configInFile);
  result = mergeConfig(result, envOverrides);
  result = mergeConfig(result, cliOverrides);
  const browser = await validateBrowserConfig(result.browser);
  if (browser.launchOptions.headless === void 0)
    browser.launchOptions.headless = import_os.default.platform() === "linux" && !process.env.DISPLAY;
  return { ...result, browser, configFile };
}
async function resolveCLIConfigForCLI(daemonProfilesDir, sessionName, options, env) {
  const config = options.config ? import_path.default.resolve(options.config) : void 0;
  try {
    const defaultConfigFile = import_path.default.resolve(".playwright", "cli.config.json");
    if (!config && import_fs.default.existsSync(defaultConfigFile))
      options.config = defaultConfigFile;
  } catch {
  }
  const daemonOverrides = configFromCLIOptions({
    endpoint: options.endpoint,
    config: options.config,
    browser: options.browser,
    headless: options.headed ? false : void 0,
    extension: options.extension,
    userDataDir: options.profile,
    snapshotMode: "full"
  });
  const envOverrides = configFromEnv(env);
  const configFile = daemonOverrides.configFile ?? envOverrides.configFile;
  const configInFile = await loadConfig(configFile);
  const globalConfigPath = import_path.default.join((env ?? process.env)["PWTEST_CLI_GLOBAL_CONFIG"] ?? import_os.default.homedir(), ".playwright", "cli.config.json");
  const globalConfigInFile = await loadConfig(import_fs.default.existsSync(globalConfigPath) ? globalConfigPath : void 0);
  let result = defaultConfig;
  result = mergeConfig(result, globalConfigInFile);
  result = mergeConfig(result, configInFile);
  result = mergeConfig(result, envOverrides);
  result = mergeConfig(result, daemonOverrides);
  if (result.browser.isolated === void 0)
    result.browser.isolated = !options.profile && !options.persistent && !result.browser.userDataDir && !result.browser.remoteEndpoint && !result.extension;
  if (!result.extension && !result.browser.isolated && !result.browser.userDataDir && !result.browser.remoteEndpoint) {
    const browserToken = result.browser.launchOptions?.channel ?? result.browser?.browserName;
    const userDataDir = import_path.default.resolve(daemonProfilesDir, `ud-${sessionName}-${browserToken}`);
    result.browser.userDataDir = userDataDir;
  }
  if (result.browser.launchOptions.headless === void 0)
    result.browser.launchOptions.headless = true;
  const browser = await validateBrowserConfig(result.browser);
  return { ...result, browser, configFile, skillMode: true };
}
async function validateBrowserConfig(browser) {
  let browserName = browser.browserName;
  if (!browserName) {
    browserName = "chromium";
    if (browser.launchOptions.channel === void 0)
      browser.launchOptions.channel = "chrome";
  }
  if (browser.browserName === "chromium" && browser.launchOptions.chromiumSandbox === void 0) {
    if (process.platform === "linux")
      browser.launchOptions.chromiumSandbox = browser.launchOptions.channel !== "chromium" && browser.launchOptions.channel !== "chrome-for-testing";
    else
      browser.launchOptions.chromiumSandbox = true;
  }
  if (browser.isolated && browser.userDataDir)
    throw new Error("Browser userDataDir is not supported in isolated mode.");
  if (browser.initScript) {
    for (const script of browser.initScript) {
      if (!await fileExistsAsync(script))
        throw new Error(`Init script file does not exist: ${script}`);
    }
  }
  if (browser.initPage) {
    for (const page of browser.initPage) {
      if (!await fileExistsAsync(page))
        throw new Error(`Init page file does not exist: ${page}`);
    }
  }
  if (browser.contextOptions.viewport === void 0) {
    if (browser.launchOptions.headless)
      browser.contextOptions.viewport = { width: 1280, height: 720 };
    else
      browser.contextOptions.viewport = null;
  }
  return { ...browser, browserName };
}
function configFromCLIOptions(cliOptions) {
  let browserName;
  let channel;
  switch (cliOptions.browser) {
    case "chrome":
    case "chrome-beta":
    case "chrome-canary":
    case "chrome-dev":
    case "msedge":
    case "msedge-beta":
    case "msedge-canary":
    case "msedge-dev":
      browserName = "chromium";
      channel = cliOptions.browser;
      break;
    case "chromium":
      browserName = "chromium";
      channel = "chrome-for-testing";
      break;
    case "firefox":
      browserName = "firefox";
      break;
    case "webkit":
      browserName = "webkit";
      break;
  }
  const launchOptions = {
    channel,
    executablePath: cliOptions.executablePath,
    headless: cliOptions.headless
  };
  if (cliOptions.sandbox !== void 0)
    launchOptions.chromiumSandbox = cliOptions.sandbox;
  if (cliOptions.proxyServer) {
    launchOptions.proxy = {
      server: cliOptions.proxyServer
    };
    if (cliOptions.proxyBypass)
      launchOptions.proxy.bypass = cliOptions.proxyBypass;
  }
  if (cliOptions.device && cliOptions.cdpEndpoint)
    throw new Error("Device emulation is not supported with cdpEndpoint.");
  const contextOptions = cliOptions.device ? import__.devices[cliOptions.device] : {};
  if (cliOptions.storageState)
    contextOptions.storageState = cliOptions.storageState;
  if (cliOptions.userAgent)
    contextOptions.userAgent = cliOptions.userAgent;
  if (cliOptions.viewportSize)
    contextOptions.viewport = cliOptions.viewportSize;
  if (cliOptions.ignoreHttpsErrors)
    contextOptions.ignoreHTTPSErrors = true;
  if (cliOptions.blockServiceWorkers)
    contextOptions.serviceWorkers = "block";
  if (cliOptions.grantPermissions)
    contextOptions.permissions = cliOptions.grantPermissions;
  const config = {
    browser: {
      browserName,
      isolated: cliOptions.isolated,
      userDataDir: cliOptions.userDataDir,
      launchOptions,
      contextOptions,
      cdpEndpoint: cliOptions.cdpEndpoint,
      cdpHeaders: cliOptions.cdpHeader,
      cdpTimeout: cliOptions.cdpTimeout,
      initPage: cliOptions.initPage,
      initScript: cliOptions.initScript,
      remoteEndpoint: cliOptions.endpoint
    },
    extension: cliOptions.extension,
    server: {
      port: cliOptions.port,
      host: cliOptions.host,
      allowedHosts: cliOptions.allowedHosts
    },
    capabilities: cliOptions.caps,
    console: {
      level: cliOptions.consoleLevel
    },
    network: {
      allowedOrigins: cliOptions.allowedOrigins,
      blockedOrigins: cliOptions.blockedOrigins
    },
    allowUnrestrictedFileAccess: cliOptions.allowUnrestrictedFileAccess,
    codegen: cliOptions.codegen,
    saveSession: cliOptions.saveSession,
    secrets: cliOptions.secrets,
    sharedBrowserContext: cliOptions.sharedBrowserContext,
    snapshot: cliOptions.snapshotMode ? { mode: cliOptions.snapshotMode } : void 0,
    outputDir: cliOptions.outputDir,
    imageResponses: cliOptions.imageResponses,
    testIdAttribute: cliOptions.testIdAttribute,
    timeouts: {
      action: cliOptions.timeoutAction,
      navigation: cliOptions.timeoutNavigation
    }
  };
  return { ...config, configFile: cliOptions.config };
}
function configFromEnv(env) {
  const e = env ?? process.env;
  const options = {};
  options.allowedHosts = commaSeparatedList(e.PLAYWRIGHT_MCP_ALLOWED_HOSTS);
  options.allowedOrigins = semicolonSeparatedList(e.PLAYWRIGHT_MCP_ALLOWED_ORIGINS);
  options.allowUnrestrictedFileAccess = envToBoolean(e.PLAYWRIGHT_MCP_ALLOW_UNRESTRICTED_FILE_ACCESS);
  options.blockedOrigins = semicolonSeparatedList(e.PLAYWRIGHT_MCP_BLOCKED_ORIGINS);
  options.blockServiceWorkers = envToBoolean(e.PLAYWRIGHT_MCP_BLOCK_SERVICE_WORKERS);
  options.browser = envToString(e.PLAYWRIGHT_MCP_BROWSER);
  options.caps = commaSeparatedList(e.PLAYWRIGHT_MCP_CAPS);
  options.cdpEndpoint = envToString(e.PLAYWRIGHT_MCP_CDP_ENDPOINT);
  options.cdpHeader = headerParser(envToString(e.PLAYWRIGHT_MCP_CDP_HEADERS));
  options.cdpTimeout = numberParser(e.PLAYWRIGHT_MCP_CDP_TIMEOUT);
  options.config = envToString(e.PLAYWRIGHT_MCP_CONFIG);
  if (e.PLAYWRIGHT_MCP_CONSOLE_LEVEL)
    options.consoleLevel = enumParser("--console-level", ["error", "warning", "info", "debug"], e.PLAYWRIGHT_MCP_CONSOLE_LEVEL);
  options.device = envToString(e.PLAYWRIGHT_MCP_DEVICE);
  options.executablePath = envToString(e.PLAYWRIGHT_MCP_EXECUTABLE_PATH);
  options.extension = envToBoolean(e.PLAYWRIGHT_MCP_EXTENSION);
  options.grantPermissions = commaSeparatedList(e.PLAYWRIGHT_MCP_GRANT_PERMISSIONS);
  options.headless = envToBoolean(e.PLAYWRIGHT_MCP_HEADLESS);
  options.host = envToString(e.PLAYWRIGHT_MCP_HOST);
  options.ignoreHttpsErrors = envToBoolean(e.PLAYWRIGHT_MCP_IGNORE_HTTPS_ERRORS);
  const initPage = envToString(e.PLAYWRIGHT_MCP_INIT_PAGE);
  if (initPage)
    options.initPage = [initPage];
  const initScript = envToString(e.PLAYWRIGHT_MCP_INIT_SCRIPT);
  if (initScript)
    options.initScript = [initScript];
  options.isolated = envToBoolean(e.PLAYWRIGHT_MCP_ISOLATED);
  if (e.PLAYWRIGHT_MCP_IMAGE_RESPONSES)
    options.imageResponses = enumParser("--image-responses", ["allow", "omit"], e.PLAYWRIGHT_MCP_IMAGE_RESPONSES);
  options.sandbox = envToBoolean(e.PLAYWRIGHT_MCP_SANDBOX);
  options.outputDir = envToString(e.PLAYWRIGHT_MCP_OUTPUT_DIR);
  options.port = numberParser(e.PLAYWRIGHT_MCP_PORT);
  options.proxyBypass = envToString(e.PLAYWRIGHT_MCP_PROXY_BYPASS);
  options.proxyServer = envToString(e.PLAYWRIGHT_MCP_PROXY_SERVER);
  options.secrets = dotenvFileLoader(e.PLAYWRIGHT_MCP_SECRETS_FILE);
  options.storageState = envToString(e.PLAYWRIGHT_MCP_STORAGE_STATE);
  options.testIdAttribute = envToString(e.PLAYWRIGHT_MCP_TEST_ID_ATTRIBUTE);
  options.timeoutAction = numberParser(e.PLAYWRIGHT_MCP_TIMEOUT_ACTION);
  options.timeoutNavigation = numberParser(e.PLAYWRIGHT_MCP_TIMEOUT_NAVIGATION);
  options.userAgent = envToString(e.PLAYWRIGHT_MCP_USER_AGENT);
  options.userDataDir = envToString(e.PLAYWRIGHT_MCP_USER_DATA_DIR);
  options.viewportSize = resolutionParser("--viewport-size", e.PLAYWRIGHT_MCP_VIEWPORT_SIZE);
  return configFromCLIOptions(options);
}
async function loadConfig(configFile) {
  if (!configFile)
    return {};
  if (configFile.endsWith(".ini"))
    return (0, import_configIni.configFromIniFile)(configFile);
  try {
    const data = await import_fs.default.promises.readFile(configFile, "utf8");
    return JSON.parse(data.charCodeAt(0) === 65279 ? data.slice(1) : data);
  } catch {
    return (0, import_configIni.configFromIniFile)(configFile);
  }
}
function pickDefined(obj) {
  return Object.fromEntries(
    Object.entries(obj ?? {}).filter(([_, v]) => v !== void 0)
  );
}
function mergeConfig(base, overrides) {
  const browser = {
    ...pickDefined(base.browser),
    ...pickDefined(overrides.browser),
    browserName: overrides.browser?.browserName ?? base.browser?.browserName,
    isolated: overrides.browser?.isolated ?? base.browser?.isolated,
    launchOptions: {
      ...pickDefined(base.browser?.launchOptions),
      ...pickDefined(overrides.browser?.launchOptions),
      // Assistant mode is not a part of the public API.
      ...{ assistantMode: true }
    },
    contextOptions: {
      ...pickDefined(base.browser?.contextOptions),
      ...pickDefined(overrides.browser?.contextOptions)
    }
  };
  if (browser.browserName !== "chromium" && browser.launchOptions)
    delete browser.launchOptions.channel;
  return {
    ...pickDefined(base),
    ...pickDefined(overrides),
    browser,
    console: {
      ...pickDefined(base.console),
      ...pickDefined(overrides.console)
    },
    network: {
      ...pickDefined(base.network),
      ...pickDefined(overrides.network)
    },
    server: {
      ...pickDefined(base.server),
      ...pickDefined(overrides.server)
    },
    snapshot: {
      ...pickDefined(base.snapshot),
      ...pickDefined(overrides.snapshot)
    },
    timeouts: {
      ...pickDefined(base.timeouts),
      ...pickDefined(overrides.timeouts)
    }
  };
}
function semicolonSeparatedList(value) {
  if (!value)
    return void 0;
  return value.split(";").map((v) => v.trim());
}
function commaSeparatedList(value) {
  if (!value)
    return void 0;
  return value.split(",").map((v) => v.trim());
}
function dotenvFileLoader(value) {
  if (!value)
    return void 0;
  return import_utilsBundle.dotenv.parse(import_fs.default.readFileSync(value, "utf8"));
}
function numberParser(value) {
  if (!value)
    return void 0;
  return +value;
}
function resolutionParser(name, value) {
  if (!value)
    return void 0;
  if (value.includes("x")) {
    const [width, height] = value.split("x").map((v) => +v);
    if (isNaN(width) || isNaN(height) || width <= 0 || height <= 0)
      throw new Error(`Invalid resolution format: use ${name}="800x600"`);
    return { width, height };
  }
  if (value.includes(",")) {
    const [width, height] = value.split(",").map((v) => +v);
    if (isNaN(width) || isNaN(height) || width <= 0 || height <= 0)
      throw new Error(`Invalid resolution format: use ${name}="800x600"`);
    return { width, height };
  }
  throw new Error(`Invalid resolution format: use ${name}="800x600"`);
}
function headerParser(arg, previous) {
  if (!arg)
    return previous;
  const result = { ...previous ?? {} };
  const colonIndex = arg.indexOf(":");
  const name = colonIndex === -1 ? arg.trim() : arg.substring(0, colonIndex).trim();
  const value = colonIndex === -1 ? "" : arg.substring(colonIndex + 1).trim();
  result[name] = value;
  return result;
}
function enumParser(name, options, value) {
  if (!options.includes(value))
    throw new Error(`Invalid ${name}: ${value}. Valid values are: ${options.join(", ")}`);
  return value;
}
function envToBoolean(value) {
  if (value === "true" || value === "1")
    return true;
  if (value === "false" || value === "0")
    return false;
  return void 0;
}
function envToString(value) {
  return value ? value.trim() : void 0;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  commaSeparatedList,
  configFromEnv,
  dotenvFileLoader,
  enumParser,
  headerParser,
  loadConfig,
  numberParser,
  resolutionParser,
  resolveCLIConfigForCLI,
  resolveCLIConfigForMCP,
  resolveConfig,
  semicolonSeparatedList
});
