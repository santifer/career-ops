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
var serverRegistry_exports = {};
__export(serverRegistry_exports, {
  serverRegistry: () => serverRegistry
});
module.exports = __toCommonJS(serverRegistry_exports);
var import_fs = __toESM(require("fs"));
var import_net = __toESM(require("net"));
var import_path = __toESM(require("path"));
var import_os = __toESM(require("os"));
const packageVersion = require("../package.json").version;
class ServerRegistry {
  async list() {
    const files = await import_fs.default.promises.readdir(this._browsersDir()).catch(() => []);
    const result = /* @__PURE__ */ new Map();
    for (const file of files) {
      try {
        const filePath = import_path.default.join(this._browsersDir(), file);
        const content = await import_fs.default.promises.readFile(filePath, "utf-8");
        const descriptor = JSON.parse(content);
        const key = descriptor.workspaceDir ?? "";
        let list = result.get(key);
        if (!list) {
          list = [];
          result.set(key, list);
        }
        list.push(canConnect(descriptor).then((connectable) => ({ ...descriptor, canConnect: connectable, file: filePath })));
      } catch {
      }
    }
    const resolvedResult = /* @__PURE__ */ new Map();
    for (const [key, promises] of result) {
      const entries = await Promise.all(promises);
      const descriptors = [];
      for (const entry of entries) {
        if (!entry.canConnect && !entry.browser.userDataDir) {
          await import_fs.default.promises.unlink(entry.file).catch(() => {
          });
          continue;
        }
        descriptors.push(entry);
      }
      if (descriptors.length)
        resolvedResult.set(key, descriptors);
    }
    return resolvedResult;
  }
  async create(browser, endpoint) {
    const file = import_path.default.join(this._browsersDir(), browser.guid);
    await import_fs.default.promises.mkdir(this._browsersDir(), { recursive: true });
    const descriptor = {
      playwrightVersion: packageVersion,
      playwrightLib: require.resolve(".."),
      title: endpoint.title,
      browser,
      endpoint: endpoint.endpoint,
      workspaceDir: endpoint.workspaceDir
    };
    await import_fs.default.promises.writeFile(file, JSON.stringify(descriptor), "utf-8");
  }
  async delete(guid) {
    const file = import_path.default.join(this._browsersDir(), guid);
    await import_fs.default.promises.unlink(file).catch(() => {
    });
  }
  async deleteUserData(guid) {
    const filePath = import_path.default.join(this._browsersDir(), guid);
    const content = await import_fs.default.promises.readFile(filePath, "utf-8");
    const descriptor = JSON.parse(content);
    if (descriptor.browser.userDataDir)
      await import_fs.default.promises.rm(descriptor.browser.userDataDir, { recursive: true, force: true });
    await import_fs.default.promises.unlink(filePath);
  }
  readDescriptor(guid) {
    const filePath = import_path.default.join(this._browsersDir(), guid);
    const content = import_fs.default.readFileSync(filePath, "utf-8");
    const descriptor = JSON.parse(content);
    return descriptor;
  }
  async find(name) {
    const entries = await this.list();
    for (const [, browsers] of entries) {
      for (const browser of browsers) {
        if (browser.title === name)
          return browser;
      }
    }
    return null;
  }
  _browsersDir() {
    return process.env.PLAYWRIGHT_SERVER_REGISTRY || registryDirectory;
  }
}
async function canConnect(descriptor) {
  if (!descriptor.endpoint)
    return false;
  if (descriptor.endpoint.startsWith("ws://") || descriptor.endpoint.startsWith("wss://")) {
    return await new Promise((resolve) => {
      const url = new URL(descriptor.endpoint);
      const socket = import_net.default.createConnection(Number(url.port), url.hostname, () => {
        socket.destroy();
        resolve(true);
      });
      socket.on("error", () => resolve(false));
    });
  }
  return await new Promise((resolve) => {
    const socket = import_net.default.createConnection(descriptor.endpoint ?? descriptor.pipeName, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
  });
}
const defaultCacheDirectory = (() => {
  if (process.platform === "linux")
    return process.env.XDG_CACHE_HOME || import_path.default.join(import_os.default.homedir(), ".cache");
  if (process.platform === "darwin")
    return import_path.default.join(import_os.default.homedir(), "Library", "Caches");
  if (process.platform === "win32")
    return process.env.LOCALAPPDATA || import_path.default.join(import_os.default.homedir(), "AppData", "Local");
  throw new Error("Unsupported platform: " + process.platform);
})();
const registryDirectory = import_path.default.join(defaultCacheDirectory, "ms-playwright", "b");
const serverRegistry = new ServerRegistry();
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  serverRegistry
});
