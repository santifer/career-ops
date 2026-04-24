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
var traceUtils_exports = {};
__export(traceUtils_exports, {
  LoadedTrace: () => LoadedTrace,
  actionTitle: () => actionTitle,
  closeTrace: () => closeTrace,
  formatTimestamp: () => formatTimestamp,
  loadTrace: () => loadTrace,
  openTrace: () => openTrace,
  saveOutputFile: () => saveOutputFile
});
module.exports = __toCommonJS(traceUtils_exports);
var import_fs = __toESM(require("fs"));
var import_path = __toESM(require("path"));
var import_traceModel = require("../../utils/isomorphic/trace/traceModel");
var import_traceLoader = require("../../utils/isomorphic/trace/traceLoader");
var import_protocolFormatter = require("../../utils/isomorphic/protocolFormatter");
var import_traceParser = require("./traceParser");
const traceDir = import_path.default.join(".playwright-cli", "trace");
const cliOutputDir = ".playwright-cli";
class LoadedTrace {
  constructor(model, loader, ordinals) {
    this.model = model;
    this.loader = loader;
    this.ordinalToCallId = ordinals.ordinalToCallId;
    this.callIdToOrdinal = ordinals.callIdToOrdinal;
  }
  resolveActionId(actionId) {
    const ordinal = parseInt(actionId, 10);
    if (!isNaN(ordinal)) {
      const callId = this.ordinalToCallId.get(ordinal);
      if (callId)
        return this.model.actions.find((a) => a.callId === callId);
    }
    return this.model.actions.find((a) => a.callId === actionId);
  }
}
function ensureTraceOpen() {
  if (!import_fs.default.existsSync(traceDir))
    throw new Error(`No trace opened. Run 'npx playwright trace open <file>' first.`);
  return traceDir;
}
async function closeTrace() {
  if (import_fs.default.existsSync(traceDir))
    await import_fs.default.promises.rm(traceDir, { recursive: true });
}
async function openTrace(traceFile) {
  const filePath = import_path.default.resolve(traceFile);
  if (!import_fs.default.existsSync(filePath))
    throw new Error(`Trace file not found: ${filePath}`);
  await closeTrace();
  await import_fs.default.promises.mkdir(traceDir, { recursive: true });
  if (filePath.endsWith(".zip"))
    await (0, import_traceParser.extractTrace)(filePath, traceDir);
  else
    await import_fs.default.promises.writeFile(import_path.default.join(traceDir, ".link"), filePath, "utf-8");
}
async function loadTrace() {
  const dir = ensureTraceOpen();
  const linkFile = import_path.default.join(dir, ".link");
  let traceDir2;
  let traceFile;
  if (import_fs.default.existsSync(linkFile)) {
    const tracePath = await import_fs.default.promises.readFile(linkFile, "utf-8");
    traceDir2 = import_path.default.dirname(tracePath);
    traceFile = import_path.default.basename(tracePath);
  } else {
    traceDir2 = dir;
  }
  const backend = new import_traceParser.DirTraceLoaderBackend(traceDir2);
  const loader = new import_traceLoader.TraceLoader();
  await loader.load(backend, traceFile);
  const model = new import_traceModel.TraceModel(traceDir2, loader.contextEntries);
  return new LoadedTrace(model, loader, buildOrdinalMap(model));
}
function formatTimestamp(ms, base) {
  const relative = ms - base;
  if (relative < 0)
    return "0:00.000";
  const totalMs = Math.floor(relative);
  const minutes = Math.floor(totalMs / 6e4);
  const seconds = Math.floor(totalMs % 6e4 / 1e3);
  const millis = totalMs % 1e3;
  return `${minutes}:${seconds.toString().padStart(2, "0")}.${millis.toString().padStart(3, "0")}`;
}
function actionTitle(action) {
  return (0, import_protocolFormatter.renderTitleForCall)({ ...action, type: action.class }) || `${action.class}.${action.method}`;
}
async function saveOutputFile(fileName, content, explicitOutput) {
  let outFile;
  if (explicitOutput) {
    outFile = explicitOutput;
  } else {
    await import_fs.default.promises.mkdir(cliOutputDir, { recursive: true });
    outFile = import_path.default.join(cliOutputDir, fileName);
  }
  await import_fs.default.promises.writeFile(outFile, content);
  return outFile;
}
function buildOrdinalMap(model) {
  const actions = model.actions.filter((a) => a.group !== "configuration");
  const { rootItem } = (0, import_traceModel.buildActionTree)(actions);
  const ordinalToCallId = /* @__PURE__ */ new Map();
  const callIdToOrdinal = /* @__PURE__ */ new Map();
  let ordinal = 1;
  const visit = (item) => {
    ordinalToCallId.set(ordinal, item.action.callId);
    callIdToOrdinal.set(item.action.callId, ordinal);
    ordinal++;
    for (const child of item.children)
      visit(child);
  };
  for (const child of rootItem.children)
    visit(child);
  return { ordinalToCallId, callIdToOrdinal };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  LoadedTrace,
  actionTitle,
  closeTrace,
  formatTimestamp,
  loadTrace,
  openTrace,
  saveOutputFile
});
