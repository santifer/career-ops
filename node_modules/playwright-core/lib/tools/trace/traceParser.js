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
var traceParser_exports = {};
__export(traceParser_exports, {
  DirTraceLoaderBackend: () => DirTraceLoaderBackend,
  extractTrace: () => extractTrace
});
module.exports = __toCommonJS(traceParser_exports);
var import_fs = __toESM(require("fs"));
var import_path = __toESM(require("path"));
var import_zipFile = require("../../server/utils/zipFile");
class DirTraceLoaderBackend {
  constructor(dir) {
    this._dir = dir;
  }
  isLive() {
    return false;
  }
  async entryNames() {
    const entries = [];
    const walk = async (dir, prefix) => {
      const items = await import_fs.default.promises.readdir(dir, { withFileTypes: true });
      for (const item of items) {
        if (item.isDirectory())
          await walk(import_path.default.join(dir, item.name), prefix ? `${prefix}/${item.name}` : item.name);
        else
          entries.push(prefix ? `${prefix}/${item.name}` : item.name);
      }
    };
    await walk(this._dir, "");
    return entries;
  }
  async hasEntry(entryName) {
    try {
      await import_fs.default.promises.access(import_path.default.join(this._dir, entryName));
      return true;
    } catch {
      return false;
    }
  }
  async readText(entryName) {
    try {
      return await import_fs.default.promises.readFile(import_path.default.join(this._dir, entryName), "utf-8");
    } catch {
    }
  }
  async readBlob(entryName) {
    try {
      const buffer = await import_fs.default.promises.readFile(import_path.default.join(this._dir, entryName));
      return new Blob([new Uint8Array(buffer)]);
    } catch {
    }
  }
}
async function extractTrace(traceFile, outDir) {
  const zipFile = new import_zipFile.ZipFile(traceFile);
  const entries = await zipFile.entries();
  for (const entry of entries) {
    const outPath = import_path.default.join(outDir, entry);
    await import_fs.default.promises.mkdir(import_path.default.dirname(outPath), { recursive: true });
    const buffer = await zipFile.read(entry);
    await import_fs.default.promises.writeFile(outPath, buffer);
  }
  zipFile.close();
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DirTraceLoaderBackend,
  extractTrace
});
