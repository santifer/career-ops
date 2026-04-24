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
var videoRecorder_exports = {};
__export(videoRecorder_exports, {
  VideoRecorder: () => VideoRecorder,
  startAutomaticVideoRecording: () => startAutomaticVideoRecording
});
module.exports = __toCommonJS(videoRecorder_exports);
var import_path = __toESM(require("path"));
var import_utils = require("../utils");
var import_processLauncher = require("./utils/processLauncher");
var import_utilsBundle = require("../utilsBundle");
var import_artifact = require("./artifact");
var import__ = require(".");
const fps = 25;
class VideoRecorder {
  constructor(screencast) {
    this._screencast = screencast;
  }
  start(options) {
    (0, import_utils.assert)(!this._artifact);
    const ffmpegPath = import__.registry.findExecutable("ffmpeg").executablePathOrDie(this._screencast.page.browserContext._browser.sdkLanguage());
    const outputFile = options.fileName ?? import_path.default.join(this._screencast.page.browserContext._browser.options.artifactsDir, (0, import_utils.createGuid)() + ".webm");
    this._client = {
      onFrame: (frame) => this._videoRecorder.writeFrame(frame.buffer, frame.frameSwapWallTime / 1e3),
      gracefulClose: () => this.stop(),
      dispose: () => this.stop().catch((e) => import_utils.debugLogger.log("error", `Failed to stop video recorder: ${String(e)}`)),
      size: options.size
    };
    const { size } = this._screencast.addClient(this._client);
    const videoSize = options.size ?? size;
    this._videoRecorder = new FfmpegVideoRecorder(ffmpegPath, videoSize, outputFile);
    this._artifact = new import_artifact.Artifact(this._screencast.page.browserContext, outputFile);
    return this._artifact;
  }
  async stop() {
    if (!this._artifact)
      return;
    const artifact = this._artifact;
    this._artifact = void 0;
    const client = this._client;
    this._client = void 0;
    const videoRecorder = this._videoRecorder;
    this._videoRecorder = void 0;
    this._screencast.removeClient(client);
    await videoRecorder.stop();
    await artifact.reportFinished();
  }
}
function startAutomaticVideoRecording(page) {
  const recordVideo = page.browserContext._options.recordVideo;
  if (!recordVideo)
    return;
  const recorder = new VideoRecorder(page.screencast);
  if (page.browserContext._options.recordVideo?.showActions)
    page.screencast.showActions(page.browserContext._options.recordVideo?.showActions);
  const dir = recordVideo.dir ?? page.browserContext._browser.options.artifactsDir;
  const artifact = recorder.start({ size: recordVideo.size, fileName: import_path.default.join(dir, page.guid + ".webm") });
  page.video = artifact;
}
class FfmpegVideoRecorder {
  constructor(ffmpegPath, size, outputFile) {
    this._process = null;
    this._gracefullyClose = null;
    this._lastWritePromise = Promise.resolve();
    this._firstFrameTimestamp = 0;
    this._lastFrame = null;
    this._lastWriteNodeTime = 0;
    this._frameQueue = [];
    this._isStopped = false;
    if (!outputFile.endsWith(".webm"))
      throw new Error("File must have .webm extension");
    this._outputFile = outputFile;
    this._ffmpegPath = ffmpegPath;
    this._size = size;
    this._launchPromise = this._launch().catch((e) => e);
  }
  async _launch() {
    await (0, import_utils.mkdirIfNeeded)(this._outputFile);
    const w = this._size.width;
    const h = this._size.height;
    const args = `-loglevel error -f image2pipe -avioflags direct -fpsprobesize 0 -probesize 32 -analyzeduration 0 -c:v mjpeg -i pipe:0 -y -an -r ${fps} -c:v vp8 -qmin 0 -qmax 50 -crf 8 -deadline realtime -speed 8 -b:v 1M -threads 1 -vf pad=${w}:${h}:0:0:gray,crop=${w}:${h}:0:0`.split(" ");
    args.push(this._outputFile);
    const { launchedProcess, gracefullyClose } = await (0, import_processLauncher.launchProcess)({
      command: this._ffmpegPath,
      args,
      stdio: "stdin",
      log: (message) => import_utils.debugLogger.log("browser", message),
      tempDirectories: [],
      attemptToGracefullyClose: async () => {
        import_utils.debugLogger.log("browser", "Closing stdin...");
        launchedProcess.stdin.end();
      },
      onExit: (exitCode, signal) => {
        import_utils.debugLogger.log("browser", `ffmpeg onkill exitCode=${exitCode} signal=${signal}`);
      }
    });
    launchedProcess.stdin.on("finish", () => {
      import_utils.debugLogger.log("browser", "ffmpeg finished input.");
    });
    launchedProcess.stdin.on("error", () => {
      import_utils.debugLogger.log("browser", "ffmpeg error.");
    });
    this._process = launchedProcess;
    this._gracefullyClose = gracefullyClose;
  }
  writeFrame(frame, timestamp) {
    this._launchPromise.then((error) => {
      if (error)
        return;
      this._writeFrame(frame, timestamp);
    });
  }
  _writeFrame(frame, timestamp) {
    (0, import_utils.assert)(this._process);
    if (this._isStopped)
      return;
    if (!this._firstFrameTimestamp)
      this._firstFrameTimestamp = timestamp;
    const frameNumber = Math.floor((timestamp - this._firstFrameTimestamp) * fps);
    if (this._lastFrame) {
      const repeatCount = frameNumber - this._lastFrame.frameNumber;
      for (let i = 0; i < repeatCount; ++i)
        this._frameQueue.push(this._lastFrame.buffer);
      this._lastWritePromise = this._lastWritePromise.then(() => this._sendFrames());
    }
    this._lastFrame = { buffer: frame, timestamp, frameNumber };
    this._lastWriteNodeTime = (0, import_utils.monotonicTime)();
  }
  async _sendFrames() {
    while (this._frameQueue.length)
      await this._sendFrame(this._frameQueue.shift());
  }
  async _sendFrame(frame) {
    return new Promise((f) => this._process.stdin.write(frame, f)).then((error) => {
      if (error)
        import_utils.debugLogger.log("browser", `ffmpeg failed to write: ${String(error)}`);
    });
  }
  async stop() {
    const error = await this._launchPromise;
    if (error)
      throw error;
    if (this._isStopped)
      return;
    if (!this._lastFrame) {
      this._writeFrame(createWhiteImage(this._size.width, this._size.height), (0, import_utils.monotonicTime)());
    }
    const addTime = Math.max(((0, import_utils.monotonicTime)() - this._lastWriteNodeTime) / 1e3, 1);
    this._writeFrame(Buffer.from([]), this._lastFrame.timestamp + addTime);
    this._isStopped = true;
    try {
      await this._lastWritePromise;
      await this._gracefullyClose();
    } catch (e) {
      import_utils.debugLogger.log("error", `ffmpeg failed to stop: ${String(e)}`);
    }
  }
}
function createWhiteImage(width, height) {
  const data = Buffer.alloc(width * height * 4, 255);
  return import_utilsBundle.jpegjs.encode({ data, width, height }, 80).data;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  VideoRecorder,
  startAutomaticVideoRecording
});
