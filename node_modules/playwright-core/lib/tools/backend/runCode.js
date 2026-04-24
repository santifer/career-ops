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
var runCode_exports = {};
__export(runCode_exports, {
  default: () => runCode_default
});
module.exports = __toCommonJS(runCode_exports);
var import_fs = __toESM(require("fs"));
var import_vm = __toESM(require("vm"));
var import_manualPromise = require("../../utils/isomorphic/manualPromise");
var import_zodBundle = require("../../zodBundle");
var import_tool = require("./tool");
const codeSchema = import_zodBundle.z.object({
  code: import_zodBundle.z.string().optional().describe(`A JavaScript function containing Playwright code to execute. It will be invoked with a single argument, page, which you can use for any page interaction. For example: \`async (page) => { await page.getByRole('button', { name: 'Submit' }).click(); return await page.title(); }\``),
  filename: import_zodBundle.z.string().optional().describe("Load code from the specified file. If both code and filename are provided, code will be ignored.")
});
const runCode = (0, import_tool.defineTabTool)({
  capability: "core",
  schema: {
    name: "browser_run_code",
    title: "Run Playwright code",
    description: "Run Playwright code snippet",
    inputSchema: codeSchema,
    type: "action"
  },
  handle: async (tab, params, response) => {
    let code = params.code;
    if (params.filename) {
      const resolvedPath = await response.resolveClientFilename(params.filename);
      code = await import_fs.default.promises.readFile(resolvedPath, "utf-8");
    }
    response.addCode(`await (${code})(page);`);
    const __end__ = new import_manualPromise.ManualPromise();
    const context = {
      page: tab.page,
      __end__
    };
    import_vm.default.createContext(context);
    await tab.waitForCompletion(async () => {
      context.__fn__ = import_vm.default.runInContext("(" + code + ")", context);
      const snippet = "(async () => {\n  try {\n    const result = await __fn__(page);\n    __end__.resolve(JSON.stringify(result));\n  } catch (e) {\n    __end__.reject(e);\n  }\n})()";
      await import_vm.default.runInContext(snippet, context);
      const result = await __end__;
      if (typeof result === "string")
        response.addTextResult(result);
    });
  }
});
var runCode_default = [
  runCode
];
