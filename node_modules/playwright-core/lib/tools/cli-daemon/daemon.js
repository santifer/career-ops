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
var daemon_exports = {};
__export(daemon_exports, {
  startCliDaemonServer: () => startCliDaemonServer
});
module.exports = __toCommonJS(daemon_exports);
var import_fs = __toESM(require("fs"));
var import_net = __toESM(require("net"));
var import_path = __toESM(require("path"));
var import_network = require("../../server/utils/network");
var import_fileUtils = require("../../server/utils/fileUtils");
var import_processLauncher = require("../../server/utils/processLauncher");
var import_browserBackend = require("../backend/browserBackend");
var import_tools = require("../backend/tools");
var import_command = require("./command");
var import_commands = require("./commands");
var import_socketConnection = require("../utils/socketConnection");
var import_registry = require("../cli-client/registry");
async function socketExists(socketPath) {
  try {
    const stat = await import_fs.default.promises.stat(socketPath);
    if (stat?.isSocket())
      return true;
  } catch (e) {
  }
  return false;
}
async function startCliDaemonServer(sessionName, browserContext, browserInfo, contextConfig = {}, clientInfo = (0, import_registry.createClientInfo)(), options) {
  const sessionConfig = createSessionConfig(clientInfo, sessionName, browserInfo, options);
  const { socketPath } = sessionConfig;
  if (process.platform !== "win32" && await socketExists(socketPath)) {
    try {
      await import_fs.default.promises.unlink(socketPath);
    } catch (error) {
      throw error;
    }
  }
  const backend = new import_browserBackend.BrowserBackend(contextConfig, browserContext, import_tools.browserTools);
  await backend.initialize({ cwd: process.cwd() });
  if (browserContext.isClosed())
    throw new Error("Browser context was closed before the daemon could start");
  const server = import_net.default.createServer((socket) => {
    const connection = new import_socketConnection.SocketConnection(socket);
    connection.onmessage = async (message) => {
      const { id, method, params } = message;
      try {
        if (method === "stop") {
          await deleteSessionFile(clientInfo, sessionConfig);
          const sendAck = async () => connection.send({ id, result: "ok" }).catch(() => {
          });
          if (options?.exitOnClose)
            (0, import_processLauncher.gracefullyProcessExitDoNotHang)(0, () => sendAck());
          else
            await sendAck();
        } else if (method === "run") {
          const { toolName, toolParams } = parseCliCommand(params.args);
          if (params.cwd)
            toolParams._meta = { cwd: params.cwd };
          const response = await backend.callTool(toolName, toolParams);
          await connection.send({ id, result: formatResult(response) });
        } else {
          throw new Error(`Unknown method: ${method}`);
        }
      } catch (e) {
        const error = process.env.PWDEBUGIMPL ? e.stack || e.message : e.message;
        connection.send({ id, error }).catch(() => {
        });
      }
    };
  });
  (0, import_network.decorateServer)(server);
  browserContext.on("close", () => Promise.resolve().then(async () => {
    await deleteSessionFile(clientInfo, sessionConfig);
    if (options?.exitOnClose)
      (0, import_processLauncher.gracefullyProcessExitDoNotHang)(0);
  }));
  await new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(socketPath, () => resolve());
  });
  await saveSessionFile(clientInfo, sessionConfig);
  return socketPath;
}
async function saveSessionFile(clientInfo, sessionConfig) {
  await import_fs.default.promises.mkdir(clientInfo.daemonProfilesDir, { recursive: true });
  const sessionFile = import_path.default.join(clientInfo.daemonProfilesDir, `${sessionConfig.name}.session`);
  await import_fs.default.promises.writeFile(sessionFile, JSON.stringify(sessionConfig, null, 2));
}
async function deleteSessionFile(clientInfo, sessionConfig) {
  await import_fs.default.promises.unlink(sessionConfig.socketPath).catch(() => {
  });
  if (!sessionConfig.cli.persistent) {
    const sessionFile = import_path.default.join(clientInfo.daemonProfilesDir, `${sessionConfig.name}.session`);
    await import_fs.default.promises.rm(sessionFile).catch(() => {
    });
  }
}
function formatResult(result) {
  const isError = result.isError;
  const text = result.content[0].type === "text" ? result.content[0].text : void 0;
  return { isError, text };
}
function parseCliCommand(args) {
  const command = import_commands.commands[args._[0]];
  if (!command)
    throw new Error("Command is required");
  return (0, import_command.parseCommand)(command, args);
}
function daemonSocketPath(clientInfo, sessionName) {
  return (0, import_fileUtils.makeSocketPath)("cli", `${clientInfo.workspaceDirHash}-${sessionName}`);
}
function createSessionConfig(clientInfo, sessionName, browserInfo, options = {}) {
  return {
    name: sessionName,
    version: clientInfo.version,
    timestamp: Date.now(),
    socketPath: daemonSocketPath(clientInfo, sessionName),
    workspaceDir: clientInfo.workspaceDir,
    cli: { persistent: options.persistent },
    browser: {
      browserName: browserInfo.browserName,
      launchOptions: browserInfo.launchOptions,
      userDataDir: browserInfo.userDataDir
    }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  startCliDaemonServer
});
