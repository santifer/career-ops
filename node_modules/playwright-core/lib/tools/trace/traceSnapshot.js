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
var traceSnapshot_exports = {};
__export(traceSnapshot_exports, {
  traceSnapshot: () => traceSnapshot
});
module.exports = __toCommonJS(traceSnapshot_exports);
var import_browserBackend = require("../backend/browserBackend");
var import_tools = require("../backend/tools");
var playwright = __toESM(require("../../.."));
var import_utils = require("../../utils");
var import_command = require("../cli-daemon/command");
var import_minimist = require("../cli-client/minimist");
var import_commands = require("../cli-daemon/commands");
var import_traceUtils = require("./traceUtils");
async function traceSnapshot(actionId, options) {
  const trace = await (0, import_traceUtils.loadTrace)();
  const action = trace.resolveActionId(actionId);
  if (!action) {
    console.error(`Action '${actionId}' not found.`);
    process.exitCode = 1;
    return;
  }
  const pageId = action.pageId;
  if (!pageId) {
    console.error(`Action '${actionId}' has no associated page.`);
    process.exitCode = 1;
    return;
  }
  const callId = action.callId;
  const storage = trace.loader.storage();
  let snapshotName;
  let renderer;
  if (options.name) {
    snapshotName = options.name;
    renderer = storage.snapshotByName(pageId, `${snapshotName}@${callId}`);
  } else {
    for (const candidate of ["input", "before", "after"]) {
      renderer = storage.snapshotByName(pageId, `${candidate}@${callId}`);
      if (renderer) {
        snapshotName = candidate;
        break;
      }
    }
  }
  if (!renderer || !snapshotName) {
    console.error(`No snapshot found for action '${actionId}'.`);
    process.exitCode = 1;
    return;
  }
  const snapshotKey = `${snapshotName}@${callId}`;
  const server = await serveTraceSnapshot(storage, trace.loader, pageId, snapshotKey);
  if (options.serve) {
    console.log(`Serving snapshot at ${server.url}`);
    await new Promise(() => {
    });
    return;
  }
  await runCommandOnSnapshot(server, options.browserArgs || []);
}
async function serveTraceSnapshot(storage, loader, pageId, snapshotKey) {
  const { SnapshotServer } = require("../../utils/isomorphic/trace/snapshotServer");
  const { HttpServer } = require("../../server/utils/httpServer");
  const snapshotServer = new SnapshotServer(storage, (sha1) => loader.resourceForSha1(sha1));
  const httpServer = new HttpServer();
  httpServer.routePrefix("/snapshot", (request, response) => {
    const url = new URL("http://localhost" + request.url);
    const searchParams = url.searchParams;
    searchParams.set("name", snapshotKey);
    const snapshotResponse = snapshotServer.serveSnapshot(pageId, searchParams, "/snapshot");
    response.statusCode = snapshotResponse.status;
    snapshotResponse.headers.forEach((value, key) => response.setHeader(key, value));
    snapshotResponse.text().then((text) => response.end(text));
    return true;
  });
  httpServer.routePrefix("/", (_request, response) => {
    response.statusCode = 302;
    response.setHeader("Location", "/snapshot");
    response.end();
    return true;
  });
  await httpServer.start({ preferredPort: 0 });
  return { url: httpServer.urlPrefix("human-readable"), stop: () => httpServer.stop() };
}
async function runCommandOnSnapshot(server, browserArgs) {
  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(server.url);
  const backend = new import_browserBackend.BrowserBackend({
    snapshot: { mode: "full" },
    outputMode: "file",
    skillMode: true
  }, context, import_tools.browserTools);
  await backend.initialize({ cwd: process.cwd() });
  try {
    if (!browserArgs.length)
      browserArgs = ["snapshot"];
    const args = (0, import_minimist.minimist)(browserArgs, { string: ["_"] });
    const command = import_commands.commands[args._[0]];
    if (!command)
      throw new Error(`Unknown command: ${args._[0]}`);
    const { toolName, toolParams } = (0, import_command.parseCommand)(command, args);
    const result = await backend.callTool(toolName, toolParams);
    const text = result.content[0]?.type === "text" ? result.content[0].text : void 0;
    if (text)
      console.log(text);
    if (result.isError) {
      console.error("Command failed.");
      process.exitCode = 1;
    }
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  } finally {
    await server.stop().catch((e) => console.error(e));
    await (0, import_utils.gracefullyCloseAll)();
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  traceSnapshot
});
