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
var traceActions_exports = {};
__export(traceActions_exports, {
  traceAction: () => traceAction,
  traceActions: () => traceActions
});
module.exports = __toCommonJS(traceActions_exports);
var import_traceModel = require("../../utils/isomorphic/trace/traceModel");
var import_locatorGenerators = require("../../utils/isomorphic/locatorGenerators");
var import_traceUtils = require("./traceUtils");
var import_formatUtils = require("../../utils/isomorphic/formatUtils");
async function traceActions(options) {
  const trace = await (0, import_traceUtils.loadTrace)();
  const actions = filterActions(trace.model.actions, options);
  const { rootItem } = (0, import_traceModel.buildActionTree)(actions);
  console.log(`  ${"#".padStart(4)} ${"Time".padEnd(9)}  ${"Action".padEnd(55)} ${"Duration".padStart(8)}`);
  console.log(`  ${"\u2500".repeat(4)} ${"\u2500".repeat(9)}  ${"\u2500".repeat(55)} ${"\u2500".repeat(8)}`);
  const visit = (item, indent) => {
    const action = item.action;
    const ordinal = trace.callIdToOrdinal.get(action.callId) ?? "?";
    const ts = (0, import_traceUtils.formatTimestamp)(action.startTime, trace.model.startTime);
    const duration = action.endTime ? (0, import_formatUtils.msToString)(action.endTime - action.startTime) : "running";
    const title = (0, import_traceUtils.actionTitle)(action);
    const locator = actionLocator(action);
    const error = action.error ? "  \u2717" : "";
    const prefix = `  ${(ordinal + ".").padStart(4)} ${ts}  ${indent}`;
    console.log(`${prefix}${title.padEnd(Math.max(1, 55 - indent.length))} ${duration.padStart(8)}${error}`);
    if (locator)
      console.log(`${" ".repeat(prefix.length)}${locator}`);
    for (const child of item.children)
      visit(child, indent + "  ");
  };
  for (const child of rootItem.children)
    visit(child, "");
}
function filterActions(actions, options) {
  let result = actions.filter((a) => a.group !== "configuration");
  if (options.grep) {
    const pattern = new RegExp(options.grep, "i");
    result = result.filter((a) => pattern.test((0, import_traceUtils.actionTitle)(a)) || pattern.test(actionLocator(a) || ""));
  }
  if (options.errorsOnly)
    result = result.filter((a) => !!a.error);
  return result;
}
function actionLocator(action, sdkLanguage) {
  return action.params.selector ? (0, import_locatorGenerators.asLocatorDescription)(sdkLanguage || "javascript", action.params.selector) : void 0;
}
async function traceAction(actionId) {
  const trace = await (0, import_traceUtils.loadTrace)();
  const action = trace.resolveActionId(actionId);
  if (!action) {
    console.error(`Action '${actionId}' not found. Use 'trace actions' to see available action IDs.`);
    process.exitCode = 1;
    return;
  }
  const title = (0, import_traceUtils.actionTitle)(action);
  console.log(`
  ${title}
`);
  console.log("  Time");
  console.log(`    start:     ${(0, import_traceUtils.formatTimestamp)(action.startTime, trace.model.startTime)}`);
  const duration = action.endTime ? (0, import_formatUtils.msToString)(action.endTime - action.startTime) : action.error ? "Timed Out" : "Running";
  console.log(`    duration:  ${duration}`);
  const paramKeys = Object.keys(action.params).filter((name) => name !== "info");
  if (paramKeys.length) {
    console.log("\n  Parameters");
    for (const key of paramKeys) {
      const value = formatParamValue(action.params[key]);
      console.log(`    ${key}: ${value}`);
    }
  }
  if (action.result) {
    console.log("\n  Return value");
    for (const [key, value] of Object.entries(action.result))
      console.log(`    ${key}: ${formatParamValue(value)}`);
  }
  if (action.error) {
    console.log("\n  Error");
    console.log(`    ${action.error.message}`);
  }
  if (action.log.length) {
    console.log("\n  Log");
    for (const entry of action.log) {
      const time = entry.time !== -1 ? (0, import_traceUtils.formatTimestamp)(entry.time, trace.model.startTime) : "";
      console.log(`    ${time.padEnd(12)} ${entry.message}`);
    }
  }
  if (action.stack?.length) {
    console.log("\n  Source");
    for (const frame of action.stack.slice(0, 5)) {
      const file = frame.file.replace(/.*[/\\](.*)/, "$1");
      console.log(`    ${file}:${frame.line}:${frame.column}`);
    }
  }
  const snapshots = [];
  if (action.beforeSnapshot)
    snapshots.push("before");
  if (action.inputSnapshot)
    snapshots.push("input");
  if (action.afterSnapshot)
    snapshots.push("after");
  if (snapshots.length) {
    console.log("\n  Snapshots");
    console.log(`    available: ${snapshots.join(", ")}`);
    console.log(`    usage:     npx playwright trace snapshot ${actionId} --name <${snapshots.join("|")}>`);
  }
  console.log("");
}
function formatParamValue(value) {
  if (value === void 0 || value === null)
    return String(value);
  if (typeof value === "string")
    return `"${value}"`;
  if (typeof value !== "object")
    return String(value);
  if (value.guid)
    return "<handle>";
  return JSON.stringify(value).slice(0, 1e3);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  traceAction,
  traceActions
});
