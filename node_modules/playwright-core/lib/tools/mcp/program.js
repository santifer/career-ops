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
var program_exports = {};
__export(program_exports, {
  decorateMCPCommand: () => decorateMCPCommand
});
module.exports = __toCommonJS(program_exports);
var import_utilsBundle = require("../../utilsBundle");
var mcpServer = __toESM(require("../utils/mcp/server"));
var import_config = require("./config");
var import_watchdog = require("./watchdog");
var import_browserFactory = require("./browserFactory");
var import_browserBackend = require("../backend/browserBackend");
var import_tools = require("../backend/tools");
var import_log = require("./log");
const version = require("../../../package.json").version;
function decorateMCPCommand(command) {
  command.option("--allowed-hosts <hosts...>", "comma-separated list of hosts this server is allowed to serve from. Defaults to the host the server is bound to. Pass '*' to disable the host check.", import_config.commaSeparatedList).option("--allowed-origins <origins>", "semicolon-separated list of TRUSTED origins to allow the browser to request. Default is to allow all.\nImportant: *does not* serve as a security boundary and *does not* affect redirects. ", import_config.semicolonSeparatedList).option("--allow-unrestricted-file-access", "allow access to files outside of the workspace roots. Also allows unrestricted access to file:// URLs. By default access to file system is restricted to workspace root directories (or cwd if no roots are configured) only, and navigation to file:// URLs is blocked.").option("--blocked-origins <origins>", "semicolon-separated list of origins to block the browser from requesting. Blocklist is evaluated before allowlist. If used without the allowlist, requests not matching the blocklist are still allowed.\nImportant: *does not* serve as a security boundary and *does not* affect redirects.", import_config.semicolonSeparatedList).option("--block-service-workers", "block service workers").option("--browser <browser>", "browser or chrome channel to use, possible values: chrome, firefox, webkit, msedge.").option("--caps <caps>", "comma-separated list of additional capabilities to enable, possible values: vision, pdf, devtools.", import_config.commaSeparatedList).option("--cdp-endpoint <endpoint>", "CDP endpoint to connect to.").option("--cdp-header <headers...>", "CDP headers to send with the connect request, multiple can be specified.", import_config.headerParser).option("--cdp-timeout <timeout>", "timeout in milliseconds for connecting to CDP endpoint, defaults to 30000ms", import_config.numberParser).option("--codegen <lang>", 'specify the language to use for code generation, possible values: "typescript", "none". Default is "typescript".', import_config.enumParser.bind(null, "--codegen", ["none", "typescript"])).option("--config <path>", "path to the configuration file.").option("--console-level <level>", 'level of console messages to return: "error", "warning", "info", "debug". Each level includes the messages of more severe levels.', import_config.enumParser.bind(null, "--console-level", ["error", "warning", "info", "debug"])).option("--device <device>", 'device to emulate, for example: "iPhone 15"').option("--executable-path <path>", "path to the browser executable.").option("--extension", 'Connect to a running browser instance (Edge/Chrome only). Requires the "Playwright MCP Bridge" browser extension to be installed.').option("--endpoint <endpoint>", "Bound browser endpoint to connect to.").option("--grant-permissions <permissions...>", 'List of permissions to grant to the browser context, for example "geolocation", "clipboard-read", "clipboard-write".', import_config.commaSeparatedList).option("--headless", "run browser in headless mode, headed by default").option("--host <host>", "host to bind server to. Default is localhost. Use 0.0.0.0 to bind to all interfaces.").option("--ignore-https-errors", "ignore https errors").option("--init-page <path...>", "path to TypeScript file to evaluate on Playwright page object").option("--init-script <path...>", "path to JavaScript file to add as an initialization script. The script will be evaluated in every page before any of the page's scripts. Can be specified multiple times.").option("--isolated", "keep the browser profile in memory, do not save it to disk.").option("--image-responses <mode>", 'whether to send image responses to the client. Can be "allow" or "omit", Defaults to "allow".', import_config.enumParser.bind(null, "--image-responses", ["allow", "omit"])).option("--no-sandbox", "disable the sandbox for all process types that are normally sandboxed.").option("--output-dir <path>", "path to the directory for output files.").option("--output-mode <mode>", 'whether to save snapshots, console messages, network logs to a file or to the standard output. Can be "file" or "stdout". Default is "stdout".', import_config.enumParser.bind(null, "--output-mode", ["file", "stdout"])).option("--port <port>", "port to listen on for SSE transport.").option("--proxy-bypass <bypass>", 'comma-separated domains to bypass proxy, for example ".com,chromium.org,.domain.com"').option("--proxy-server <proxy>", 'specify proxy server, for example "http://myproxy:3128" or "socks5://myproxy:8080"').option("--sandbox", "enable the sandbox for all process types that are normally not sandboxed.").option("--save-session", "Whether to save the Playwright MCP session into the output directory.").option("--secrets <path>", "path to a file containing secrets in the dotenv format", import_config.dotenvFileLoader).option("--shared-browser-context", "reuse the same browser context between all connected HTTP clients.").option("--snapshot-mode <mode>", 'when taking snapshots for responses, specifies the mode to use. Can be "full" or "none". Default is "full".').option("--storage-state <path>", "path to the storage state file for isolated sessions.").option("--test-id-attribute <attribute>", 'specify the attribute to use for test ids, defaults to "data-testid"').option("--timeout-action <timeout>", "specify action timeout in milliseconds, defaults to 5000ms", import_config.numberParser).option("--timeout-navigation <timeout>", "specify navigation timeout in milliseconds, defaults to 60000ms", import_config.numberParser).option("--user-agent <ua string>", "specify user agent string").option("--user-data-dir <path>", "path to the user data directory. If not specified, a temporary directory will be created.").option("--viewport-size <size>", 'specify browser viewport size in pixels, for example "1280x720"', import_config.resolutionParser.bind(null, "--viewport-size")).addOption(new import_utilsBundle.ProgramOption("--vision", "Legacy option, use --caps=vision instead").hideHelp()).action(async (options) => {
    options.sandbox = options.sandbox === true ? void 0 : false;
    (0, import_watchdog.setupExitWatchdog)();
    if (options.vision) {
      console.error("The --vision option is deprecated, use --caps=vision instead");
      options.caps = "vision";
    }
    if (options.caps?.includes("tracing"))
      options.caps.push("devtools");
    const config = await (0, import_config.resolveCLIConfigForMCP)(options);
    const tools = (0, import_tools.filteredTools)(config);
    if (config.extension) {
      const serverBackendFactory = {
        name: "Playwright w/ extension",
        nameInConfig: "playwright-extension",
        version,
        toolSchemas: tools.map((tool) => tool.schema),
        create: async (clientInfo) => {
          const browser = await (0, import_browserFactory.createBrowser)(config, clientInfo);
          const browserContext = browser.contexts()[0];
          return new import_browserBackend.BrowserBackend(config, browserContext, tools);
        },
        disposed: async () => {
        }
      };
      await mcpServer.start(serverBackendFactory, config.server);
      return;
    }
    const useSharedBrowser = config.sharedBrowserContext || config.browser.isolated;
    let sharedBrowser;
    let clientCount = 0;
    const factory = {
      name: "Playwright",
      nameInConfig: "playwright",
      version,
      toolSchemas: tools.map((tool) => tool.schema),
      create: async (clientInfo) => {
        if (useSharedBrowser && clientCount === 0)
          sharedBrowser = await (0, import_browserFactory.createBrowser)(config, clientInfo);
        clientCount++;
        const browser = sharedBrowser || await (0, import_browserFactory.createBrowser)(config, clientInfo);
        const browserContext = config.browser.isolated ? await browser.newContext(config.browser.contextOptions) : browser.contexts()[0];
        return new import_browserBackend.BrowserBackend(config, browserContext, tools);
      },
      disposed: async (backend) => {
        clientCount--;
        if (sharedBrowser && clientCount > 0)
          return;
        (0, import_log.testDebug)("close browser");
        sharedBrowser = void 0;
        const browserContext = backend.browserContext;
        await browserContext.close().catch(() => {
        });
        await browserContext.browser().close().catch(() => {
        });
      }
    };
    await mcpServer.start(factory, config.server);
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  decorateMCPCommand
});
