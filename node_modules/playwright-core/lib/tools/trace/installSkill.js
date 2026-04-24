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
var installSkill_exports = {};
__export(installSkill_exports, {
  installSkill: () => installSkill
});
module.exports = __toCommonJS(installSkill_exports);
var import_fs = __toESM(require("fs"));
var import_path = __toESM(require("path"));
async function installSkill() {
  const cwd = process.cwd();
  const skillSource = import_path.default.join(__dirname, "SKILL.md");
  const destDir = import_path.default.join(cwd, ".claude", "skills", "playwright-trace");
  await import_fs.default.promises.mkdir(destDir, { recursive: true });
  const destFile = import_path.default.join(destDir, "SKILL.md");
  await import_fs.default.promises.copyFile(skillSource, destFile);
  console.log(`\u2705 Skill installed to \`${import_path.default.relative(cwd, destFile)}\`.`);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  installSkill
});
