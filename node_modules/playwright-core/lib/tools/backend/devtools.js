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
var devtools_exports = {};
__export(devtools_exports, {
  default: () => devtools_default
});
module.exports = __toCommonJS(devtools_exports);
var import_zodBundle = require("../../zodBundle");
var import_tool = require("./tool");
const resume = (0, import_tool.defineTool)({
  capability: "devtools",
  schema: {
    name: "browser_resume",
    title: "Resume paused script execution",
    description: "Resume script execution after it was paused. When called with step set to true, execution will pause again before the next action.",
    inputSchema: import_zodBundle.z.object({
      step: import_zodBundle.z.boolean().optional().describe("When true, execution will pause again before the next action, allowing step-by-step debugging."),
      location: import_zodBundle.z.string().optional().describe('Pause execution at a specific <file>:<line>, e.g. "example.spec.ts:42".')
    }),
    type: "action"
  },
  handle: async (context, params, response) => {
    const browserContext = await context.ensureBrowserContext();
    const pausedPromise = new Promise((resolve) => {
      const listener = () => {
        if (browserContext.debugger.pausedDetails()) {
          browserContext.debugger.off("pausedstatechanged", listener);
          resolve();
        }
      };
      browserContext.debugger.on("pausedstatechanged", listener);
    });
    if (params.location) {
      const [file, lineStr] = params.location.split(":");
      let location;
      if (lineStr) {
        const line = Number(lineStr);
        if (isNaN(line))
          throw new Error(`Invalid location "${params.location}", expected format is <file>:<line>, e.g. "example.spec.ts:42"`);
        location = { file, line };
      } else {
        location = { file: params.location };
      }
      await browserContext.debugger.runTo(location);
    } else if (params.step) {
      await browserContext.debugger.next();
    } else {
      await browserContext.debugger.resume();
    }
    await pausedPromise;
  }
});
var devtools_default = [resume];
