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
var program_exports = {};
__export(program_exports, {
  program: () => import_utilsBundle2.program
});
module.exports = __toCommonJS(program_exports);
var import_bootstrap = require("../bootstrap");
var import_utils = require("../utils");
var import_traceCli = require("../tools/trace/traceCli");
var import_utilsBundle = require("../utilsBundle");
var import_utilsBundle2 = require("../utilsBundle");
const packageJSON = require("../../package.json");
import_utilsBundle.program.version("Version " + (process.env.PW_CLI_DISPLAY_VERSION || packageJSON.version)).name(buildBasePlaywrightCLICommand(process.env.PW_LANG_NAME));
import_utilsBundle.program.command("mark-docker-image [dockerImageNameTemplate]", { hidden: true }).description("mark docker image").allowUnknownOption(true).action(async function(dockerImageNameTemplate) {
  const { markDockerImage } = require("./installActions");
  markDockerImage(dockerImageNameTemplate).catch(logErrorAndExit);
});
commandWithOpenOptions("open [url]", "open page in browser specified via -b, --browser", []).action(async function(url, options) {
  const { open } = require("./browserActions");
  open(options, url).catch(logErrorAndExit);
}).addHelpText("afterAll", `
Examples:

  $ open
  $ open -b webkit https://example.com`);
commandWithOpenOptions(
  "codegen [url]",
  "open page and generate code for user actions",
  [
    ["-o, --output <file name>", "saves the generated script to a file"],
    ["--target <language>", `language to generate, one of javascript, playwright-test, python, python-async, python-pytest, csharp, csharp-mstest, csharp-nunit, java, java-junit`, codegenId()],
    ["--test-id-attribute <attributeName>", "use the specified attribute to generate data test ID selectors"]
  ]
).action(async function(url, options) {
  const { codegen } = require("./browserActions");
  await codegen(options, url);
}).addHelpText("afterAll", `
Examples:

  $ codegen
  $ codegen --target=python
  $ codegen -b webkit https://example.com`);
import_utilsBundle.program.command("install [browser...]").description("ensure browsers necessary for this version of Playwright are installed").option("--with-deps", "install system dependencies for browsers").option("--dry-run", "do not execute installation, only print information").option("--list", "prints list of browsers from all playwright installations").option("--force", "force reinstall of already installed browsers").option("--only-shell", "only install headless shell when installing chromium").option("--no-shell", "do not install chromium headless shell").action(async function(args, options) {
  try {
    const { installBrowsers } = require("./installActions");
    await installBrowsers(args, options);
  } catch (e) {
    console.log(`Failed to install browsers
${e}`);
    (0, import_utils.gracefullyProcessExitDoNotHang)(1);
  }
}).addHelpText("afterAll", `

Examples:
  - $ install
    Install default browsers.

  - $ install chrome firefox
    Install custom browsers, supports chromium, firefox, webkit, chromium-headless-shell.`);
import_utilsBundle.program.command("uninstall").description("Removes browsers used by this installation of Playwright from the system (chromium, firefox, webkit, ffmpeg). This does not include branded channels.").option("--all", "Removes all browsers used by any Playwright installation from the system.").action(async (options) => {
  const { uninstallBrowsers } = require("./installActions");
  uninstallBrowsers(options).catch(logErrorAndExit);
});
import_utilsBundle.program.command("install-deps [browser...]").description("install dependencies necessary to run browsers (will ask for sudo permissions)").option("--dry-run", "Do not execute installation commands, only print them").action(async function(args, options) {
  try {
    const { installDeps } = require("./installActions");
    await installDeps(args, options);
  } catch (e) {
    console.log(`Failed to install browser dependencies
${e}`);
    (0, import_utils.gracefullyProcessExitDoNotHang)(1);
  }
}).addHelpText("afterAll", `
Examples:
  - $ install-deps
    Install dependencies for default browsers.

  - $ install-deps chrome firefox
    Install dependencies for specific browsers, supports chromium, firefox, webkit, chromium-headless-shell.`);
const browsers = [
  { alias: "cr", name: "Chromium", type: "chromium" },
  { alias: "ff", name: "Firefox", type: "firefox" },
  { alias: "wk", name: "WebKit", type: "webkit" }
];
for (const { alias, name, type } of browsers) {
  commandWithOpenOptions(`${alias} [url]`, `open page in ${name}`, []).action(async function(url, options) {
    const { open } = require("./browserActions");
    open({ ...options, browser: type }, url).catch(logErrorAndExit);
  }).addHelpText("afterAll", `
Examples:

  $ ${alias} https://example.com`);
}
commandWithOpenOptions(
  "screenshot <url> <filename>",
  "capture a page screenshot",
  [
    ["--wait-for-selector <selector>", "wait for selector before taking a screenshot"],
    ["--wait-for-timeout <timeout>", "wait for timeout in milliseconds before taking a screenshot"],
    ["--full-page", "whether to take a full page screenshot (entire scrollable area)"]
  ]
).action(async function(url, filename, command) {
  const { screenshot } = require("./browserActions");
  screenshot(command, command, url, filename).catch(logErrorAndExit);
}).addHelpText("afterAll", `
Examples:

  $ screenshot -b webkit https://example.com example.png`);
commandWithOpenOptions(
  "pdf <url> <filename>",
  "save page as pdf",
  [
    ["--paper-format <format>", "paper format: Letter, Legal, Tabloid, Ledger, A0, A1, A2, A3, A4, A5, A6"],
    ["--wait-for-selector <selector>", "wait for given selector before saving as pdf"],
    ["--wait-for-timeout <timeout>", "wait for given timeout in milliseconds before saving as pdf"]
  ]
).action(async function(url, filename, options) {
  const { pdf } = require("./browserActions");
  pdf(options, options, url, filename).catch(logErrorAndExit);
}).addHelpText("afterAll", `
Examples:

  $ pdf https://example.com example.pdf`);
import_utilsBundle.program.command("run-driver", { hidden: true }).action(async function(options) {
  const { runDriver } = require("./driver");
  runDriver();
});
import_utilsBundle.program.command("run-server", { hidden: true }).option("--port <port>", "Server port").option("--host <host>", "Server host").option("--path <path>", "Endpoint Path", "/").option("--max-clients <maxClients>", "Maximum clients").option("--mode <mode>", 'Server mode, either "default" or "extension"').option("--artifacts-dir <artifactsDir>", "Artifacts directory").action(async function(options) {
  const { runServer } = require("./driver");
  runServer({
    port: options.port ? +options.port : void 0,
    host: options.host,
    path: options.path,
    maxConnections: options.maxClients ? +options.maxClients : Infinity,
    extension: options.mode === "extension" || !!process.env.PW_EXTENSION_MODE,
    artifactsDir: options.artifactsDir
  }).catch(logErrorAndExit);
});
import_utilsBundle.program.command("print-api-json", { hidden: true }).action(async function(options) {
  const { printApiJson } = require("./driver");
  printApiJson();
});
import_utilsBundle.program.command("launch-server", { hidden: true }).requiredOption("--browser <browserName>", 'Browser name, one of "chromium", "firefox" or "webkit"').option("--config <path-to-config-file>", "JSON file with launchServer options").action(async function(options) {
  const { launchBrowserServer } = require("./driver");
  launchBrowserServer(options.browser, options.config);
});
import_utilsBundle.program.command("show-trace [trace]").option("-b, --browser <browserType>", "browser to use, one of cr, chromium, ff, firefox, wk, webkit", "chromium").option("-h, --host <host>", "Host to serve trace on; specifying this option opens trace in a browser tab").option("-p, --port <port>", "Port to serve trace on, 0 for any free port; specifying this option opens trace in a browser tab").option("--stdin", "Accept trace URLs over stdin to update the viewer").description("show trace viewer").action(async function(trace, options) {
  if (options.browser === "cr")
    options.browser = "chromium";
  if (options.browser === "ff")
    options.browser = "firefox";
  if (options.browser === "wk")
    options.browser = "webkit";
  const openOptions = {
    host: options.host,
    port: +options.port,
    isServer: !!options.stdin
  };
  const { runTraceInBrowser, runTraceViewerApp } = require("../server/trace/viewer/traceViewer");
  if (options.port !== void 0 || options.host !== void 0)
    runTraceInBrowser(trace, openOptions).catch(logErrorAndExit);
  else
    runTraceViewerApp(trace, options.browser, openOptions).catch(logErrorAndExit);
}).addHelpText("afterAll", `
Examples:

  $ show-trace
  $ show-trace https://example.com/trace.zip`);
(0, import_traceCli.addTraceCommands)(import_utilsBundle.program, logErrorAndExit);
import_utilsBundle.program.command("cli", { hidden: true }).allowExcessArguments(true).allowUnknownOption(true).action(async (options) => {
  const { program: cliProgram } = require("../tools/cli-client/program");
  process.argv.splice(process.argv.indexOf("cli"), 1);
  cliProgram().catch(logErrorAndExit);
});
function logErrorAndExit(e) {
  if (process.env.PWDEBUGIMPL)
    console.error(e);
  else
    console.error(e.name + ": " + e.message);
  (0, import_utils.gracefullyProcessExitDoNotHang)(1);
}
function codegenId() {
  return process.env.PW_LANG_NAME || "playwright-test";
}
function commandWithOpenOptions(command, description, options) {
  let result = import_utilsBundle.program.command(command).description(description);
  for (const option of options)
    result = result.option(option[0], ...option.slice(1));
  return result.option("-b, --browser <browserType>", "browser to use, one of cr, chromium, ff, firefox, wk, webkit", "chromium").option("--block-service-workers", "block service workers").option("--channel <channel>", 'Chromium distribution channel, "chrome", "chrome-beta", "msedge-dev", etc').option("--color-scheme <scheme>", 'emulate preferred color scheme, "light" or "dark"').option("--device <deviceName>", 'emulate device, for example  "iPhone 11"').option("--geolocation <coordinates>", 'specify geolocation coordinates, for example "37.819722,-122.478611"').option("--ignore-https-errors", "ignore https errors").option("--load-storage <filename>", "load context storage state from the file, previously saved with --save-storage").option("--lang <language>", 'specify language / locale, for example "en-GB"').option("--proxy-server <proxy>", 'specify proxy server, for example "http://myproxy:3128" or "socks5://myproxy:8080"').option("--proxy-bypass <bypass>", 'comma-separated domains to bypass proxy, for example ".com,chromium.org,.domain.com"').option("--save-har <filename>", "save HAR file with all network activity at the end").option("--save-har-glob <glob pattern>", "filter entries in the HAR by matching url against this glob pattern").option("--save-storage <filename>", "save context storage state at the end, for later use with --load-storage").option("--timezone <time zone>", 'time zone to emulate, for example "Europe/Rome"').option("--timeout <timeout>", "timeout for Playwright actions in milliseconds, no timeout by default").option("--user-agent <ua string>", "specify user agent string").option("--user-data-dir <directory>", "use the specified user data directory instead of a new context").option("--viewport-size <size>", 'specify browser viewport size in pixels, for example "1280, 720"');
}
function buildBasePlaywrightCLICommand(cliTargetLang) {
  switch (cliTargetLang) {
    case "python":
      return `playwright`;
    case "java":
      return `mvn exec:java -e -D exec.mainClass=com.microsoft.playwright.CLI -D exec.args="...options.."`;
    case "csharp":
      return `pwsh bin/Debug/netX/playwright.ps1`;
    default: {
      const packageManagerCommand = (0, import_utils.getPackageManagerExecCommand)();
      return `${packageManagerCommand} playwright`;
    }
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  program
});
