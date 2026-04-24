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
var traceCli_exports = {};
__export(traceCli_exports, {
  addTraceCommands: () => addTraceCommands
});
module.exports = __toCommonJS(traceCli_exports);
function addTraceCommands(program, logErrorAndExit) {
  const traceCommand = program.command("trace").description("inspect trace files from the command line");
  traceCommand.command("open <trace>").description("extract trace file for inspection").action(async (trace) => {
    const { traceOpen } = require("./traceOpen");
    traceOpen(trace).catch(logErrorAndExit);
  });
  traceCommand.command("close").description("remove extracted trace data").action(async () => {
    const { closeTrace } = require("./traceUtils");
    closeTrace().catch(logErrorAndExit);
  });
  traceCommand.command("actions").description("list actions in the trace").option("--grep <pattern>", "filter actions by title pattern").option("--errors-only", "only show failed actions").action(async (options) => {
    const { traceActions } = require("./traceActions");
    traceActions(options).catch(logErrorAndExit);
  });
  traceCommand.command("action <action-id>").description("show details of a specific action").action(async (actionId) => {
    const { traceAction } = require("./traceActions");
    traceAction(actionId).catch(logErrorAndExit);
  });
  traceCommand.command("requests").description("show network requests").option("--grep <pattern>", "filter by URL pattern").option("--method <method>", "filter by HTTP method").option("--status <code>", "filter by status code").option("--failed", "only show failed requests (status >= 400)").action(async (options) => {
    const { traceRequests } = require("./traceRequests");
    traceRequests(options).catch(logErrorAndExit);
  });
  traceCommand.command("request <request-id>").description("show details of a specific network request").action(async (requestId) => {
    const { traceRequest } = require("./traceRequests");
    traceRequest(requestId).catch(logErrorAndExit);
  });
  traceCommand.command("console").description("show console messages").option("--errors-only", "only show errors").option("--warnings", "show errors and warnings").option("--browser", "only browser console messages").option("--stdio", "only stdout/stderr").action(async (options) => {
    const { traceConsole } = require("./traceConsole");
    traceConsole(options).catch(logErrorAndExit);
  });
  traceCommand.command("errors").description("show errors with stack traces").action(async () => {
    const { traceErrors } = require("./traceErrors");
    traceErrors().catch(logErrorAndExit);
  });
  traceCommand.command("snapshot <action-id>").description("run a playwright-cli command against a DOM snapshot").option("--name <name>", "snapshot phase: before, input, or after").option("--serve", "serve snapshot on localhost and keep running").allowUnknownOption(true).allowExcessArguments(true).action(async (actionId, options, cmd) => {
    try {
      const { traceSnapshot } = require("./traceSnapshot");
      const browserArgs = cmd.args.slice(1);
      await traceSnapshot(actionId, { ...options, browserArgs });
    } catch (e) {
      logErrorAndExit(e);
    }
  });
  traceCommand.command("screenshot <action-id>").description("save screencast screenshot for an action").option("-o, --output <path>", "output file path").action(async (actionId, options) => {
    const { traceScreenshot } = require("./traceScreenshot");
    traceScreenshot(actionId, options).catch(logErrorAndExit);
  });
  traceCommand.command("attachments").description("list trace attachments").action(async () => {
    const { traceAttachments } = require("./traceAttachments");
    traceAttachments().catch(logErrorAndExit);
  });
  traceCommand.command("attachment <attachment-id>").description("extract a trace attachment by its number").option("-o, --output <path>", "output file path").action(async (attachmentId, options) => {
    const { traceAttachment } = require("./traceAttachments");
    traceAttachment(attachmentId, options).catch(logErrorAndExit);
  });
  traceCommand.command("install-skill").description("install SKILL.md for LLM integration").action(async () => {
    const { installSkill } = require("./installSkill");
    installSkill().catch(logErrorAndExit);
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  addTraceCommands
});
