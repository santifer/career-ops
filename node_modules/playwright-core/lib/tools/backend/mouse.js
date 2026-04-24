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
var mouse_exports = {};
__export(mouse_exports, {
  default: () => mouse_default
});
module.exports = __toCommonJS(mouse_exports);
var import_zodBundle = require("../../zodBundle");
var import_stringUtils = require("../../utils/isomorphic/stringUtils");
var import_tool = require("./tool");
const mouseMove = (0, import_tool.defineTabTool)({
  capability: "vision",
  schema: {
    name: "browser_mouse_move_xy",
    title: "Move mouse",
    description: "Move mouse to a given position",
    inputSchema: import_zodBundle.z.object({
      x: import_zodBundle.z.number().describe("X coordinate"),
      y: import_zodBundle.z.number().describe("Y coordinate")
    }),
    type: "input"
  },
  handle: async (tab, params, response) => {
    response.addCode(`// Move mouse to (${params.x}, ${params.y})`);
    response.addCode(`await page.mouse.move(${params.x}, ${params.y});`);
    await tab.page.mouse.move(params.x, params.y);
  }
});
const mouseDown = (0, import_tool.defineTabTool)({
  capability: "vision",
  schema: {
    name: "browser_mouse_down",
    title: "Press mouse down",
    description: "Press mouse down",
    inputSchema: import_zodBundle.z.object({
      button: import_zodBundle.z.enum(["left", "right", "middle"]).optional().describe("Button to press, defaults to left")
    }),
    type: "input"
  },
  handle: async (tab, params, response) => {
    const options = { button: params.button };
    const optionsArg = (0, import_stringUtils.formatObjectOrVoid)(options);
    response.addCode(`// Press mouse down`);
    response.addCode(`await page.mouse.down(${optionsArg});`);
    await tab.page.mouse.down(options);
  }
});
const mouseUp = (0, import_tool.defineTabTool)({
  capability: "vision",
  schema: {
    name: "browser_mouse_up",
    title: "Press mouse up",
    description: "Press mouse up",
    inputSchema: import_zodBundle.z.object({
      button: import_zodBundle.z.enum(["left", "right", "middle"]).optional().describe("Button to press, defaults to left")
    }),
    type: "input"
  },
  handle: async (tab, params, response) => {
    const options = { button: params.button };
    const optionsArg = (0, import_stringUtils.formatObjectOrVoid)(options);
    response.addCode(`// Press mouse up`);
    response.addCode(`await page.mouse.up(${optionsArg});`);
    await tab.page.mouse.up(options);
  }
});
const mouseWheel = (0, import_tool.defineTabTool)({
  capability: "vision",
  schema: {
    name: "browser_mouse_wheel",
    title: "Scroll mouse wheel",
    description: "Scroll mouse wheel",
    inputSchema: import_zodBundle.z.object({
      deltaX: import_zodBundle.z.number().default(0).describe("X delta"),
      deltaY: import_zodBundle.z.number().default(0).describe("Y delta")
    }),
    type: "input"
  },
  handle: async (tab, params, response) => {
    response.addCode(`// Scroll mouse wheel`);
    response.addCode(`await page.mouse.wheel(${params.deltaX}, ${params.deltaY});`);
    await tab.page.mouse.wheel(params.deltaX, params.deltaY);
  }
});
const mouseClick = (0, import_tool.defineTabTool)({
  capability: "vision",
  schema: {
    name: "browser_mouse_click_xy",
    title: "Click",
    description: "Click mouse button at a given position",
    inputSchema: import_zodBundle.z.object({
      x: import_zodBundle.z.number().describe("X coordinate"),
      y: import_zodBundle.z.number().describe("Y coordinate"),
      button: import_zodBundle.z.enum(["left", "right", "middle"]).optional().describe("Button to click, defaults to left"),
      clickCount: import_zodBundle.z.number().optional().describe("Number of clicks, defaults to 1"),
      delay: import_zodBundle.z.number().optional().describe("Time to wait between mouse down and mouse up in milliseconds, defaults to 0")
    }),
    type: "input"
  },
  handle: async (tab, params, response) => {
    response.setIncludeSnapshot();
    const options = {
      button: params.button,
      clickCount: params.clickCount,
      delay: params.delay
    };
    const formatted = (0, import_stringUtils.formatObjectOrVoid)(options);
    const optionsArg = formatted ? `, ${formatted}` : "";
    response.addCode(`// Click mouse at coordinates (${params.x}, ${params.y})`);
    response.addCode(`await page.mouse.click(${params.x}, ${params.y}${optionsArg});`);
    await tab.waitForCompletion(async () => {
      await tab.page.mouse.click(params.x, params.y, options);
    });
  }
});
const mouseDrag = (0, import_tool.defineTabTool)({
  capability: "vision",
  schema: {
    name: "browser_mouse_drag_xy",
    title: "Drag mouse",
    description: "Drag left mouse button to a given position",
    inputSchema: import_zodBundle.z.object({
      startX: import_zodBundle.z.number().describe("Start X coordinate"),
      startY: import_zodBundle.z.number().describe("Start Y coordinate"),
      endX: import_zodBundle.z.number().describe("End X coordinate"),
      endY: import_zodBundle.z.number().describe("End Y coordinate")
    }),
    type: "input"
  },
  handle: async (tab, params, response) => {
    response.setIncludeSnapshot();
    response.addCode(`// Drag mouse from (${params.startX}, ${params.startY}) to (${params.endX}, ${params.endY})`);
    response.addCode(`await page.mouse.move(${params.startX}, ${params.startY});`);
    response.addCode(`await page.mouse.down();`);
    response.addCode(`await page.mouse.move(${params.endX}, ${params.endY});`);
    response.addCode(`await page.mouse.up();`);
    await tab.waitForCompletion(async () => {
      await tab.page.mouse.move(params.startX, params.startY);
      await tab.page.mouse.down();
      await tab.page.mouse.move(params.endX, params.endY);
      await tab.page.mouse.up();
    });
  }
});
var mouse_default = [
  mouseMove,
  mouseClick,
  mouseDrag,
  mouseDown,
  mouseUp,
  mouseWheel
];
