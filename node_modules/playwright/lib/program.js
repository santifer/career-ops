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
  program: () => import_program2.program
});
module.exports = __toCommonJS(program_exports);
var import_bootstrap = require("playwright-core/lib/bootstrap");
var import_utils = require("playwright-core/lib/utils");
var import_program = require("playwright-core/lib/cli/program");
var import_config = require("./common/config");
var import_program2 = require("playwright-core/lib/cli/program");
const packageJSON = require("../package.json");
function addTestCommand(program3) {
  const command = program3.command("test [test-filter...]");
  command.description("run tests with Playwright Test");
  const options = testOptions.sort((a, b) => a[0].replace(/-/g, "").localeCompare(b[0].replace(/-/g, "")));
  options.forEach(([name, { description, choices, preset }]) => {
    const option = command.createOption(name, description);
    if (choices)
      option.choices(choices);
    if (preset)
      option.preset(preset);
    command.addOption(option);
    return command;
  });
  command.action(async (args, opts) => {
    try {
      const { runTests } = require("./testActions");
      await runTests(args, opts);
    } catch (e) {
      console.error(e);
      (0, import_utils.gracefullyProcessExitDoNotHang)(1);
    }
  });
  command.addHelpText("afterAll", `
Arguments [test-filter...]:
  Pass arguments to filter test files. Each argument is treated as a regular expression. Matching is performed against the absolute file paths.

Examples:
  $ npx playwright test my.spec.ts
  $ npx playwright test some.spec.ts:42
  $ npx playwright test --headed
  $ npx playwright test --project=webkit`);
}
function addClearCacheCommand(program3) {
  const command = program3.command("clear-cache");
  command.description("clears build and test caches");
  command.option("-c, --config <file>", `Configuration file, or a test directory with optional "playwright.config.{m,c}?{js,ts}"`);
  command.action(async (opts) => {
    const { clearCache } = require("./testActions");
    await clearCache(opts);
  });
}
function addDevServerCommand(program3) {
  const command = program3.command("dev-server", { hidden: true });
  command.description("start dev server");
  command.option("-c, --config <file>", `Configuration file, or a test directory with optional "playwright.config.{m,c}?{js,ts}"`);
  command.action(async (options) => {
    const { startDevServer } = require("./testActions");
    await startDevServer(options);
  });
}
function addTestServerCommand(program3) {
  const command = program3.command("test-server", { hidden: true });
  command.description("start test server");
  command.option("-c, --config <file>", `Configuration file, or a test directory with optional "playwright.config.{m,c}?{js,ts}"`);
  command.option("--host <host>", "Host to start the server on", "localhost");
  command.option("--port <port>", "Port to start the server on", "0");
  command.action(async (opts) => {
    const { runTestServerAction } = require("./testActions");
    await runTestServerAction(opts);
  });
}
function addShowReportCommand(program3) {
  const command = program3.command("show-report [report]");
  command.description("show HTML report");
  command.action(async (report, options) => {
    const { showReport } = require("./reportActions");
    await showReport(report, options.host, +options.port);
  });
  command.option("--host <host>", "Host to serve report on", "localhost");
  command.option("--port <port>", "Port to serve report on", "9323");
  command.addHelpText("afterAll", `
Arguments [report]:
  When specified, opens given report, otherwise opens last generated report.

Examples:
  $ npx playwright show-report
  $ npx playwright show-report playwright-report`);
}
function addMergeReportsCommand(program3) {
  const command = program3.command("merge-reports [dir]");
  command.description("merge multiple blob reports (for sharded tests) into a single report");
  command.action(async (dir, options) => {
    try {
      const { mergeReports } = require("./reportActions");
      await mergeReports(dir, options);
    } catch (e) {
      console.error(e);
      (0, import_utils.gracefullyProcessExitDoNotHang)(1);
    }
  });
  command.option("-c, --config <file>", `Configuration file. Can be used to specify additional configuration for the output report.`);
  command.option("--reporter <reporter>", `Reporter to use, comma-separated, can be ${import_config.builtInReporters.map((name) => `"${name}"`).join(", ")} (default: "${import_config.defaultReporter}")`);
  command.addHelpText("afterAll", `
Arguments [dir]:
  Directory containing blob reports.

Examples:
  $ npx playwright merge-reports playwright-report`);
}
function addTestMCPServerCommand(program3) {
  const command = program3.command("run-test-mcp-server", { hidden: true });
  command.description("Interact with the test runner over MCP");
  command.option("--headless", "run browser in headless mode, headed by default");
  command.option("-c, --config <file>", `Configuration file, or a test directory with optional "playwright.config.{m,c}?{js,ts}"`);
  command.option("--host <host>", "host to bind server to. Default is localhost. Use 0.0.0.0 to bind to all interfaces.");
  command.option("--port <port>", "port to listen on for SSE transport.");
  command.action(async (options) => {
    const { start, setupExitWatchdog } = await import("playwright-core/lib/tools/exports");
    const { TestServerBackend, testServerBackendTools } = require("./mcp/test/testBackend");
    setupExitWatchdog();
    const factory = {
      name: "Playwright Test Runner",
      nameInConfig: "playwright-test-runner",
      version: packageJSON.version,
      toolSchemas: testServerBackendTools.map((tool) => tool.schema),
      create: async () => new TestServerBackend(options.config, { muteConsole: options.port === void 0, headless: options.headless }),
      disposed: async () => {
      }
    };
    await start(factory, { port: options.port === void 0 ? void 0 : +options.port, host: options.host });
  });
}
function addInitAgentsCommand(program3) {
  const command = program3.command("init-agents");
  command.description("Initialize repository agents");
  const option = command.createOption("--loop <loop>", "Agentic loop provider");
  option.choices(["claude", "copilot", "opencode", "vscode", "vscode-legacy"]);
  command.addOption(option);
  command.option("-c, --config <file>", `Configuration file to find a project to use for seed test`);
  command.option("--project <project>", "Project to use for seed test");
  command.option("--prompts", "Whether to include prompts in the agent initialization");
  command.action(async (opts) => {
    const { loadConfigFromFile } = require("./common/configLoader");
    const { ClaudeGenerator, OpencodeGenerator, VSCodeGenerator, CopilotGenerator } = require("./agents/generateAgents");
    const config = await loadConfigFromFile(opts.config);
    if (opts.loop === "opencode") {
      await OpencodeGenerator.init(config, opts.project, opts.prompts);
    } else if (opts.loop === "vscode-legacy") {
      await VSCodeGenerator.init(config, opts.project);
    } else if (opts.loop === "claude") {
      await ClaudeGenerator.init(config, opts.project, opts.prompts);
    } else {
      await CopilotGenerator.init(config, opts.project, opts.prompts);
      return;
    }
  });
}
const kTraceModes = ["on", "off", "on-first-retry", "on-all-retries", "retain-on-failure", "retain-on-first-failure", "retain-on-failure-and-retries"];
const testOptions = [
  /* deprecated */
  ["--browser <browser>", { description: `Browser to use for tests, one of "all", "chromium", "firefox" or "webkit" (default: "chromium")` }],
  ["-c, --config <file>", { description: `Configuration file, or a test directory with optional "playwright.config.{m,c}?{js,ts}"` }],
  ["--debug [mode]", { description: `Run tests with Playwright Inspector. Shortcut for "PWDEBUG=1" environment variable and "--timeout=0 --max-failures=1 --headed --workers=1" options`, choices: ["inspector", "cli"], preset: "inspector" }],
  ["--fail-on-flaky-tests", { description: `Fail if any test is flagged as flaky (default: false)` }],
  ["--forbid-only", { description: `Fail if test.only is called (default: false)` }],
  ["--fully-parallel", { description: `Run all tests in parallel (default: false)` }],
  ["--global-timeout <timeout>", { description: `Maximum time this test suite can run in milliseconds (default: unlimited)` }],
  ["-g, --grep <grep>", { description: `Only run tests matching this regular expression (default: ".*")` }],
  ["--grep-invert <grep>", { description: `Only run tests that do not match this regular expression` }],
  ["--headed", { description: `Run tests in headed browsers (default: headless)` }],
  ["--ignore-snapshots", { description: `Ignore screenshot and snapshot expectations` }],
  ["--last-failed", { description: `Only re-run the failures` }],
  ["--list", { description: `Collect all the tests and report them, but do not run` }],
  ["--max-failures <N>", { description: `Stop after the first N failures` }],
  ["--no-deps", { description: `Do not run project dependencies` }],
  ["--output <dir>", { description: `Folder for output artifacts (default: "test-results")` }],
  ["--only-changed [ref]", { description: `Only run test files that have been changed between 'HEAD' and 'ref'. Defaults to running all uncommitted changes. Only supports Git.` }],
  ["--pass-with-no-tests", { description: `Makes test run succeed even if no tests were found` }],
  ["--project <project-name...>", { description: `Only run tests from the specified list of projects, supports '*' wildcard (default: run all projects)` }],
  ["--quiet", { description: `Suppress stdio` }],
  ["--repeat-each <N>", { description: `Run each test N times (default: 1)` }],
  ["--reporter <reporter>", { description: `Reporter to use, comma-separated, can be ${import_config.builtInReporters.map((name) => `"${name}"`).join(", ")} (default: "${import_config.defaultReporter}")` }],
  ["--retries <retries>", { description: `Maximum retry count for flaky tests, zero for no retries (default: no retries)` }],
  ["--run-agents <mode>", { description: `Run agents to generate the code for page.perform`, choices: ["missing", "all", "none"], preset: "none" }],
  ["--shard <shard>", { description: `Shard tests and execute only the selected shard, specify in the form "current/all", 1-based, for example "3/5"` }],
  ["--test-list <file>", { description: `Path to a file containing a list of tests to run. See https://playwright.dev/docs/test-cli for more details.` }],
  ["--test-list-invert <file>", { description: `Path to a file containing a list of tests to skip. See https://playwright.dev/docs/test-cli for more details.` }],
  ["--timeout <timeout>", { description: `Specify test timeout threshold in milliseconds, zero for unlimited (default: ${import_config.defaultTimeout})` }],
  ["--trace <mode>", { description: `Force tracing mode`, choices: kTraceModes }],
  ["--tsconfig <path>", { description: `Path to a single tsconfig applicable to all imported files (default: look up tsconfig for each imported file separately)` }],
  ["--ui", { description: `Run tests in interactive UI mode` }],
  ["--ui-host <host>", { description: `Host to serve UI on; specifying this option opens UI in a browser tab` }],
  ["--ui-port <port>", { description: `Port to serve UI on, 0 for any free port; specifying this option opens UI in a browser tab` }],
  ["-u, --update-snapshots [mode]", { description: `Update snapshots with actual results. Running tests without the flag defaults to "missing"`, choices: ["all", "changed", "missing", "none"], preset: "changed" }],
  ["--update-source-method <method>", { description: `Chooses the way source is updated (default: "patch")`, choices: ["overwrite", "3way", "patch"] }],
  ["-j, --workers <workers>", { description: `Number of concurrent workers or percentage of logical CPU cores, use 1 to run in a single worker (default: 50%)` }],
  ["-x", { description: `Stop after the first failure` }]
];
addTestCommand(import_program.program);
addShowReportCommand(import_program.program);
addMergeReportsCommand(import_program.program);
addClearCacheCommand(import_program.program);
addTestMCPServerCommand(import_program.program);
addDevServerCommand(import_program.program);
addTestServerCommand(import_program.program);
addInitAgentsCommand(import_program.program);
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  program
});
