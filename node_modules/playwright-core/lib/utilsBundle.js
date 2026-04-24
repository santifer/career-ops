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
var utilsBundle_exports = {};
__export(utilsBundle_exports, {
  HttpsProxyAgent: () => HttpsProxyAgent,
  PNG: () => PNG,
  ProgramOption: () => ProgramOption,
  SocksProxyAgent: () => SocksProxyAgent,
  colors: () => colors,
  debug: () => debug,
  diff: () => diff,
  dotenv: () => dotenv,
  getProxyForUrl: () => getProxyForUrl,
  ini: () => ini,
  jpegjs: () => jpegjs,
  lockfile: () => lockfile,
  mime: () => mime,
  minimatch: () => minimatch,
  open: () => open,
  program: () => program,
  progress: () => progress,
  ws: () => ws,
  wsReceiver: () => wsReceiver,
  wsSender: () => wsSender,
  wsServer: () => wsServer,
  yaml: () => yaml
});
module.exports = __toCommonJS(utilsBundle_exports);
const colors = require("./utilsBundleImpl").colors;
const debug = require("./utilsBundleImpl").debug;
const diff = require("./utilsBundleImpl").diff;
const dotenv = require("./utilsBundleImpl").dotenv;
const ini = require("./utilsBundleImpl").ini;
const getProxyForUrl = require("./utilsBundleImpl").getProxyForUrl;
const HttpsProxyAgent = require("./utilsBundleImpl").HttpsProxyAgent;
const jpegjs = require("./utilsBundleImpl").jpegjs;
const lockfile = require("./utilsBundleImpl").lockfile;
const mime = require("./utilsBundleImpl").mime;
const minimatch = require("./utilsBundleImpl").minimatch;
const open = require("./utilsBundleImpl").open;
const PNG = require("./utilsBundleImpl").PNG;
const program = require("./utilsBundleImpl").program;
const ProgramOption = require("./utilsBundleImpl").ProgramOption;
const progress = require("./utilsBundleImpl").progress;
const SocksProxyAgent = require("./utilsBundleImpl").SocksProxyAgent;
const ws = require("./utilsBundleImpl").ws;
const wsServer = require("./utilsBundleImpl").wsServer;
const wsReceiver = require("./utilsBundleImpl").wsReceiver;
const wsSender = require("./utilsBundleImpl").wsSender;
const yaml = require("./utilsBundleImpl").yaml;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  HttpsProxyAgent,
  PNG,
  ProgramOption,
  SocksProxyAgent,
  colors,
  debug,
  diff,
  dotenv,
  getProxyForUrl,
  ini,
  jpegjs,
  lockfile,
  mime,
  minimatch,
  open,
  program,
  progress,
  ws,
  wsReceiver,
  wsSender,
  wsServer,
  yaml
});
