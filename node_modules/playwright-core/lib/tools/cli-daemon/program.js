"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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
var import_fs = __toESM(require("fs"));
var import_os = __toESM(require("os"));
var import_path = __toESM(require("path"));
var import_daemon = require("./daemon");
var import_watchdog = require("../mcp/watchdog");
var import_browserFactory = require("../mcp/browserFactory");
var configUtils = __toESM(require("../mcp/config"));
var import_registry = require("../cli-client/registry");
var import_utilsBundle = require("../../utilsBundle");
var import_registry2 = require("../../server/registry/index");
import_utilsBundle.program.argument("[session-name]", "name of the session to create or connect to", "default").option("--headed", "run in headed mode (non-headless)").option("--extension", "run with the extension").option("--browser <name>", "browser to use (chromium, chrome, firefox, webkit)").option("--persistent", "use a persistent browser context").option("--profile <path>", "path to the user data dir").option("--config <path>", "path to the config file; by default uses .playwright/cli.config.json in the project directory and ~/.playwright/cli.config.json as global config").option("--endpoint <endpoint>", "attach to a running Playwright browser endpoint").option("--init-workspace", "initialize workspace").option("--init-skills <value>", 'install skills for the given agent type ("claude" or "agents")').action(async (sessionName, options) => {
  if (options.initWorkspace) {
    await initWorkspace(options.initSkills);
    return;
  }
  (0, import_watchdog.setupExitWatchdog)();
  const clientInfo = (0, import_registry.createClientInfo)();
  const mcpConfig = await configUtils.resolveCLIConfigForCLI(clientInfo.daemonProfilesDir, sessionName, options);
  const clientInfoEx = {
    cwd: process.cwd(),
    sessionName,
    workspaceDir: clientInfo.workspaceDir
  };
  try {
    const { browser, browserInfo } = await (0, import_browserFactory.createBrowserWithInfo)(mcpConfig, clientInfoEx);
    const browserContext = mcpConfig.browser.isolated ? await browser.newContext(mcpConfig.browser.contextOptions) : browser.contexts()[0];
    if (!browserContext)
      throw new Error("Error: unable to connect to a browser that does not have any contexts");
    const persistent = options.persistent || options.profile || mcpConfig.browser.userDataDir ? true : void 0;
    const socketPath = await (0, import_daemon.startCliDaemonServer)(sessionName, browserContext, browserInfo, mcpConfig, clientInfo, { persistent, exitOnClose: true });
    console.log(`### Success
Daemon listening on ${socketPath}`);
    console.log("<EOF>");
  } catch (error) {
    const message = process.env.PWDEBUGIMPL ? error.stack || error.message : error.message;
    console.log(`### Error
${message}`);
    console.log("<EOF>");
  }
});
void import_utilsBundle.program.parseAsync();
function defaultConfigFile() {
  return import_path.default.resolve(".playwright", "cli.config.json");
}
function globalConfigFile() {
  return import_path.default.join(process.env["PWTEST_CLI_GLOBAL_CONFIG"] ?? import_os.default.homedir(), ".playwright", "cli.config.json");
}
async function initWorkspace(initSkills) {
  const cwd = process.cwd();
  const playwrightDir = import_path.default.join(cwd, ".playwright");
  await import_fs.default.promises.mkdir(playwrightDir, { recursive: true });
  console.log(`\u2705 Workspace initialized at \`${cwd}\`.`);
  if (initSkills) {
    const skillSourceDir = import_path.default.join(__dirname, "../cli-client/skill");
    const target = initSkills === "agents" ? "agents" : "claude";
    const skillDestDir = import_path.default.join(cwd, `.${target}`, "skills", "playwright-cli");
    if (!import_fs.default.existsSync(skillSourceDir)) {
      console.error("\u274C Skills source directory not found:", skillSourceDir);
      process.exit(1);
    }
    await import_fs.default.promises.cp(skillSourceDir, skillDestDir, { recursive: true });
    console.log(`\u2705 Skills installed to \`${import_path.default.relative(cwd, skillDestDir)}\`.`);
  }
  await ensureConfiguredBrowserInstalled();
}
async function ensureConfiguredBrowserInstalled() {
  if (import_fs.default.existsSync(defaultConfigFile()) || import_fs.default.existsSync(globalConfigFile())) {
    const clientInfo = (0, import_registry.createClientInfo)();
    const config = await configUtils.resolveCLIConfigForCLI(clientInfo.daemonProfilesDir, "default", {});
    const browserName = config.browser.browserName;
    const channel = config.browser.launchOptions.channel;
    if (!channel || channel.startsWith("chromium")) {
      const executable = import_registry2.registry.findExecutable(channel ?? browserName);
      if (executable && !import_fs.default.existsSync(executable.executablePath()))
        await import_registry2.registry.install([executable]);
    }
  } else {
    const channel = await findOrInstallDefaultBrowser();
    if (channel !== "chrome")
      await createDefaultConfig(channel);
  }
}
async function findOrInstallDefaultBrowser() {
  const channels = ["chrome", "msedge"];
  for (const channel of channels) {
    const executable = import_registry2.registry.findExecutable(channel);
    if (!executable?.executablePath())
      continue;
    console.log(`\u2705 Found ${channel}, will use it as the default browser.`);
    return channel;
  }
  const chromiumExecutable = import_registry2.registry.findExecutable("chromium");
  if (!import_fs.default.existsSync(chromiumExecutable?.executablePath()))
    await import_registry2.registry.install([chromiumExecutable]);
  return "chromium";
}
async function createDefaultConfig(channel) {
  const config = {
    browser: {
      browserName: "chromium",
      launchOptions: { channel }
    }
  };
  await import_fs.default.promises.writeFile(defaultConfigFile(), JSON.stringify(config, null, 2));
  console.log(`\u2705 Created default config for ${channel} at ${import_path.default.relative(process.cwd(), defaultConfigFile())}.`);
}
