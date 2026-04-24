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
var evaluate_exports = {};
__export(evaluate_exports, {
  default: () => evaluate_default
});
module.exports = __toCommonJS(evaluate_exports);
var import_zodBundle = require("../../zodBundle");
var import_stringUtils = require("../../utils/isomorphic/stringUtils");
var import_tool = require("./tool");
const evaluateSchema = import_zodBundle.z.object({
  function: import_zodBundle.z.string().describe("() => { /* code */ } or (element) => { /* code */ } when element is provided"),
  element: import_zodBundle.z.string().optional().describe("Human-readable element description used to obtain permission to interact with the element"),
  ref: import_zodBundle.z.string().optional().describe("Exact target element reference from the page snapshot"),
  selector: import_zodBundle.z.string().optional().describe('CSS or role selector for the target element, when "ref" is not available.'),
  filename: import_zodBundle.z.string().optional().describe("Filename to save the result to. If not provided, result is returned as text.")
});
const evaluate = (0, import_tool.defineTabTool)({
  capability: "core",
  schema: {
    name: "browser_evaluate",
    title: "Evaluate JavaScript",
    description: "Evaluate JavaScript expression on page or element",
    inputSchema: evaluateSchema,
    type: "action"
  },
  handle: async (tab, params, response) => {
    let locator;
    if (!params.function.includes("=>"))
      params.function = `() => (${params.function})`;
    if (params.ref) {
      locator = await tab.refLocator({ ref: params.ref, selector: params.selector, element: params.element || "element" });
      response.addCode(`await page.${locator.resolved}.evaluate(${(0, import_stringUtils.escapeWithQuotes)(params.function)});`);
    } else {
      response.addCode(`await page.evaluate(${(0, import_stringUtils.escapeWithQuotes)(params.function)});`);
    }
    await tab.waitForCompletion(async () => {
      const func = new Function();
      func.toString = () => params.function;
      const result = locator?.locator ? await locator?.locator.evaluate(func) : await tab.page.evaluate(func);
      const text = JSON.stringify(result, null, 2) || "undefined";
      await response.addResult("Evaluation result", text, { prefix: "result", ext: "json", suggestedFilename: params.filename });
    });
  }
});
var evaluate_default = [
  evaluate
];
