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
  calculateSha1: () => calculateSha1,
  program: () => program
});
module.exports = __toCommonJS(program_exports);
var import_child_process = require("child_process");
var import_crypto = __toESM(require("crypto"));
var import_os = __toESM(require("os"));
var import_path = __toESM(require("path"));
var import_registry = require("./registry");
var import_session = require("./session");
var import_serverRegistry = require("../../serverRegistry");
var import_minimist = require("./minimist");
const globalOptions = [
  "endpoint",
  "browser",
  "config",
  "extension",
  "headed",
  "help",
  "persistent",
  "profile",
  "session",
  "version"
];
const booleanOptions = [
  "all",
  "help",
  "version"
];
async function program(options) {
  const clientInfo = (0, import_registry.createClientInfo)();
  const help = require("./help.json");
  const argv = process.argv.slice(2);
  const boolean = [...help.booleanOptions, ...booleanOptions];
  const args = (0, import_minimist.minimist)(argv, { boolean, string: ["_"] });
  if (args.s) {
    args.session = args.s;
    delete args.s;
  }
  const commandName = args._?.[0];
  if (args.version || args.v) {
    console.log(options?.embedderVersion ?? clientInfo.version);
    process.exit(0);
  }
  const command = commandName && help.commands[commandName];
  if (args.help || args.h) {
    if (command) {
      console.log(command.help);
    } else {
      console.log("playwright-cli - run playwright mcp commands from terminal\n");
      console.log(help.global);
    }
    process.exit(0);
  }
  if (!command) {
    console.error(`Unknown command: ${commandName}
`);
    console.log(help.global);
    process.exit(1);
  }
  validateFlags(args, command);
  const registry = await import_registry.Registry.load();
  const sessionName = (0, import_registry.resolveSessionName)(args.session);
  switch (commandName) {
    case "list": {
      await listSessions(registry, clientInfo, !!args.all);
      return;
    }
    case "close-all": {
      const entries = registry.entries(clientInfo);
      for (const entry of entries)
        await new import_session.Session(entry).stop(true);
      return;
    }
    case "delete-data": {
      const entry = registry.entry(clientInfo, sessionName);
      if (!entry) {
        console.log(`No user data found for browser '${sessionName}'.`);
        return;
      }
      await new import_session.Session(entry).deleteData();
      return;
    }
    case "kill-all": {
      await killAllDaemons();
      return;
    }
    case "open": {
      await startSession(sessionName, registry, clientInfo, args);
      return;
    }
    case "attach": {
      const attachTarget = args._[1];
      const attachSessionName = (0, import_registry.explicitSessionName)(args.session) ?? attachTarget;
      args.endpoint = attachTarget;
      args.session = attachSessionName;
      await startSession(attachSessionName, registry, clientInfo, args);
      return;
    }
    case "close":
      const closeEntry = registry.entry(clientInfo, sessionName);
      const session = closeEntry ? new import_session.Session(closeEntry) : void 0;
      if (!session || !await session.canConnect()) {
        console.log(`Browser '${sessionName}' is not open.`);
        return;
      }
      await session.stop();
      return;
    case "install":
      await runInitWorkspace(args);
      return;
    case "install-browser":
      await installBrowser();
      return;
    case "show": {
      const daemonScript = require.resolve("../dashboard/dashboardApp.js");
      const child = (0, import_child_process.spawn)(process.execPath, [daemonScript], {
        detached: true,
        stdio: "ignore"
      });
      child.unref();
      return;
    }
    default: {
      const entry = registry.entry(clientInfo, sessionName);
      if (!entry) {
        console.log(`The browser '${sessionName}' is not open, please run open first`);
        console.log("");
        console.log(`  playwright-cli${sessionName !== "default" ? ` -s=${sessionName}` : ""} open [params]`);
        process.exit(1);
      }
      await runInSession(entry, clientInfo, args);
    }
  }
}
async function startSession(sessionName, registry, clientInfo, args) {
  const entry = registry.entry(clientInfo, sessionName);
  if (entry)
    await new import_session.Session(entry).stop(true);
  await import_session.Session.startDaemon(clientInfo, args);
  const newEntry = await registry.loadEntry(clientInfo, sessionName);
  await runInSession(newEntry, clientInfo, args);
}
async function runInSession(entry, clientInfo, args) {
  for (const globalOption of globalOptions)
    delete args[globalOption];
  const session = new import_session.Session(entry);
  const result = await session.run(clientInfo, args);
  console.log(result.text);
}
async function runInitWorkspace(args) {
  const cliPath = require.resolve("../cli-daemon/program.js");
  const daemonArgs = [cliPath, "--init-workspace", ...args.skills ? ["--init-skills", String(args.skills)] : []];
  await new Promise((resolve, reject) => {
    const child = (0, import_child_process.spawn)(process.execPath, daemonArgs, {
      stdio: "inherit",
      cwd: process.cwd()
    });
    child.on("close", (code) => {
      if (code === 0)
        resolve();
      else
        reject(new Error(`Workspace initialization failed with exit code ${code}`));
    });
  });
}
async function installBrowser() {
  const { program: program2 } = require("../../cli/program");
  const argv = process.argv.map((arg) => arg === "install-browser" ? "install" : arg);
  program2.parse(argv);
}
async function killAllDaemons() {
  const platform = import_os.default.platform();
  let killed = 0;
  try {
    if (platform === "win32") {
      const result = (0, import_child_process.execSync)(
        `powershell -NoProfile -NonInteractive -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*run-mcp-server*' -or $_.CommandLine -like '*run-cli-server*' -or $_.CommandLine -like '*cli-daemon*' -or $_.CommandLine -like '*dashboardApp.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; $_.ProcessId }"`,
        { encoding: "utf-8" }
      );
      const pids = result.split("\n").map((line) => line.trim()).filter((line) => /^\d+$/.test(line));
      for (const pid of pids)
        console.log(`Killed daemon process ${pid}`);
      killed = pids.length;
    } else {
      const result = (0, import_child_process.execSync)("ps aux", { encoding: "utf-8" });
      const lines = result.split("\n");
      for (const line of lines) {
        if (line.includes("run-mcp-server") || line.includes("run-cli-server") || line.includes("cli-daemon") || line.includes("dashboardApp.js")) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[1];
          if (pid && /^\d+$/.test(pid)) {
            try {
              process.kill(parseInt(pid, 10), "SIGKILL");
              console.log(`Killed daemon process ${pid}`);
              killed++;
            } catch {
            }
          }
        }
      }
    }
  } catch (e) {
  }
  if (killed === 0)
    console.log("No daemon processes found.");
  else if (killed > 0)
    console.log(`Killed ${killed} daemon process${killed === 1 ? "" : "es"}.`);
}
async function listSessions(registry, clientInfo, all) {
  console.log("### Browsers");
  let count = 0;
  const runningSessions = /* @__PURE__ */ new Set();
  const entries = registry.entryMap();
  for (const [workspace, list] of entries) {
    if (!all && workspace !== clientInfo.workspaceDir)
      continue;
    count += await gcAndPrintSessions(clientInfo, list.map((entry) => new import_session.Session(entry)), all ? `${import_path.default.relative(process.cwd(), workspace) || "/"}:` : void 0, runningSessions);
  }
  const serverEntries = await import_serverRegistry.serverRegistry.list();
  const filteredServerEntries = /* @__PURE__ */ new Map();
  for (const [workspace, list] of serverEntries) {
    if (!all && workspace !== clientInfo.workspaceDir)
      continue;
    const unattached = list.filter((d) => !runningSessions.has(d.title));
    if (unattached.length)
      filteredServerEntries.set(workspace, unattached);
  }
  if (filteredServerEntries.size) {
    if (count)
      console.log("");
    console.log("### Browser servers available for attach");
  }
  for (const [workspace, list] of filteredServerEntries)
    count += await gcAndPrintBrowserSessions(workspace, list);
  if (!count)
    console.log("  (no browsers)");
}
async function gcAndPrintSessions(clientInfo, sessions, header, runningSessions) {
  const running = [];
  const stopped = [];
  for (const session of sessions) {
    const canConnect = await session.canConnect();
    if (canConnect) {
      running.push(session);
      runningSessions?.add(session.name);
    } else {
      if (session.config.cli.persistent)
        stopped.push(session);
      else
        await session.deleteSessionConfig();
    }
  }
  if (header && (running.length || stopped.length))
    console.log(header);
  for (const session of running)
    console.log(await renderSessionStatus(clientInfo, session));
  for (const session of stopped)
    console.log(await renderSessionStatus(clientInfo, session));
  return running.length + stopped.length;
}
async function gcAndPrintBrowserSessions(workspace, list) {
  if (!list.length)
    return 0;
  if (workspace)
    console.log(`${import_path.default.relative(process.cwd(), workspace) || "/"}:`);
  for (const descriptor of list) {
    const text = [];
    text.push(`- browser "${descriptor.title}":`);
    text.push(`  - browser: ${descriptor.browser.browserName}`);
    text.push(`  - version: v${descriptor.playwrightVersion}`);
    text.push(`  - status: ${descriptor.canConnect ? "open" : "closed"}`);
    if (descriptor.browser.userDataDir)
      text.push(`  - data-dir: ${descriptor.browser.userDataDir}`);
    else
      text.push(`  - data-dir: <in-memory>`);
    text.push(`  - run \`playwright-cli attach "${descriptor.title}"\` to attach`);
    console.log(text.join("\n"));
  }
  return list.length;
}
async function renderSessionStatus(clientInfo, session) {
  const text = [];
  const config = session.config;
  const canConnect = await session.canConnect();
  text.push(`- ${session.name}:`);
  text.push(`  - status: ${canConnect ? "open" : "closed"}`);
  if (canConnect && !session.isCompatible(clientInfo))
    text.push(`  - version: v${config.version} [incompatible please re-open]`);
  if (config.browser)
    text.push(...(0, import_session.renderResolvedConfig)(config));
  return text.join("\n");
}
function validateFlags(args, command) {
  const unknownFlags = [];
  for (const key of Object.keys(args)) {
    if (key === "_")
      continue;
    if (globalOptions.includes(key))
      continue;
    if (!(key in command.flags))
      unknownFlags.push(key);
  }
  if (unknownFlags.length) {
    console.error(`Unknown option${unknownFlags.length > 1 ? "s" : ""}: ${unknownFlags.map((f) => `--${f}`).join(", ")}`);
    console.log("");
    console.log(command.help);
    process.exit(1);
  }
}
function calculateSha1(buffer) {
  const hash = import_crypto.default.createHash("sha1");
  hash.update(buffer);
  return hash.digest("hex");
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  calculateSha1,
  program
});
