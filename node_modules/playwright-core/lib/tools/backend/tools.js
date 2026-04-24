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
var tools_exports = {};
__export(tools_exports, {
  browserTools: () => browserTools,
  filteredTools: () => filteredTools
});
module.exports = __toCommonJS(tools_exports);
var import_zodBundle = require("../../zodBundle");
var import_common = __toESM(require("./common"));
var import_config = __toESM(require("./config"));
var import_console = __toESM(require("./console"));
var import_cookies = __toESM(require("./cookies"));
var import_devtools = __toESM(require("./devtools"));
var import_dialogs = __toESM(require("./dialogs"));
var import_evaluate = __toESM(require("./evaluate"));
var import_files = __toESM(require("./files"));
var import_form = __toESM(require("./form"));
var import_keyboard = __toESM(require("./keyboard"));
var import_mouse = __toESM(require("./mouse"));
var import_navigate = __toESM(require("./navigate"));
var import_network = __toESM(require("./network"));
var import_pdf = __toESM(require("./pdf"));
var import_route = __toESM(require("./route"));
var import_runCode = __toESM(require("./runCode"));
var import_snapshot = __toESM(require("./snapshot"));
var import_screenshot = __toESM(require("./screenshot"));
var import_storage = __toESM(require("./storage"));
var import_tabs = __toESM(require("./tabs"));
var import_tracing = __toESM(require("./tracing"));
var import_verify = __toESM(require("./verify"));
var import_video = __toESM(require("./video"));
var import_wait = __toESM(require("./wait"));
var import_webstorage = __toESM(require("./webstorage"));
const browserTools = [
  ...import_common.default,
  ...import_config.default,
  ...import_console.default,
  ...import_cookies.default,
  ...import_devtools.default,
  ...import_dialogs.default,
  ...import_evaluate.default,
  ...import_files.default,
  ...import_form.default,
  ...import_keyboard.default,
  ...import_mouse.default,
  ...import_navigate.default,
  ...import_network.default,
  ...import_pdf.default,
  ...import_route.default,
  ...import_runCode.default,
  ...import_screenshot.default,
  ...import_snapshot.default,
  ...import_storage.default,
  ...import_tabs.default,
  ...import_tracing.default,
  ...import_verify.default,
  ...import_video.default,
  ...import_wait.default,
  ...import_webstorage.default
];
function filteredTools(config2) {
  return browserTools.filter((tool) => tool.capability.startsWith("core") || config2.capabilities?.includes(tool.capability)).filter((tool) => !tool.skillOnly).map((tool) => ({
    ...tool,
    schema: {
      ...tool.schema,
      // Note: we first ensure that "selector" property is present, so that we can omit() it without an error.
      inputSchema: tool.schema.inputSchema.extend({ selector: import_zodBundle.z.string(), startSelector: import_zodBundle.z.string(), endSelector: import_zodBundle.z.string() }).omit({ selector: true, startSelector: true, endSelector: true })
    }
  }));
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  browserTools,
  filteredTools
});
