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
var video_exports = {};
__export(video_exports, {
  default: () => video_default
});
module.exports = __toCommonJS(video_exports);
var import_zodBundle = require("../../zodBundle");
var import_tool = require("./tool");
const videoStart = (0, import_tool.defineTool)({
  capability: "devtools",
  schema: {
    name: "browser_start_video",
    title: "Start video",
    description: "Start video recording",
    inputSchema: import_zodBundle.z.object({
      filename: import_zodBundle.z.string().optional().describe("Filename to save the video."),
      size: import_zodBundle.z.object({
        width: import_zodBundle.z.number().describe("Video width"),
        height: import_zodBundle.z.number().describe("Video height")
      }).optional().describe("Video size")
    }),
    type: "readOnly"
  },
  handle: async (context, params, response) => {
    const resolvedFile = await response.resolveClientFile({ prefix: "video", ext: "webm", suggestedFilename: params.filename }, "Video");
    await context.startVideoRecording(resolvedFile.fileName, { size: params.size });
    response.addTextResult("Video recording started.");
  }
});
const videoStop = (0, import_tool.defineTool)({
  capability: "devtools",
  schema: {
    name: "browser_stop_video",
    title: "Stop video",
    description: "Stop video recording",
    inputSchema: import_zodBundle.z.object({}),
    type: "readOnly"
  },
  handle: async (context, params, response) => {
    const fileNames = await context.stopVideoRecording();
    if (!fileNames.length) {
      response.addTextResult("No videos were recorded.");
      return;
    }
    for (const fileName of fileNames) {
      const resolvedFile = await response.resolveClientFile({
        prefix: "video",
        ext: "webm",
        suggestedFilename: fileName
      }, "Video");
      await response.addFileResult(resolvedFile, null);
    }
  }
});
const videoChapter = (0, import_tool.defineTool)({
  capability: "devtools",
  schema: {
    name: "browser_video_chapter",
    title: "Video chapter",
    description: "Add a chapter marker to the video recording. Shows a full-screen chapter card with blurred backdrop.",
    inputSchema: import_zodBundle.z.object({
      title: import_zodBundle.z.string().describe("Chapter title"),
      description: import_zodBundle.z.string().optional().describe("Chapter description"),
      duration: import_zodBundle.z.number().optional().describe("Duration in milliseconds to show the chapter card")
    }),
    type: "readOnly"
  },
  handle: async (context, params, response) => {
    const tab = context.currentTabOrDie();
    await tab.page.screencast.showChapter(params.title, {
      description: params.description,
      duration: params.duration
    });
    response.addTextResult(`Chapter '${params.title}' added.`);
  }
});
var video_default = [
  videoStart,
  videoStop,
  videoChapter
];
