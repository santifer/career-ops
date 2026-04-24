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
var server_exports = {};
__export(server_exports, {
  allRootPaths: () => allRootPaths,
  connect: () => connect,
  createServer: () => createServer,
  firstRootPath: () => firstRootPath,
  start: () => start
});
module.exports = __toCommonJS(server_exports);
var import_url = require("url");
var import_utilsBundle = require("../../../utilsBundle");
var mcpBundle = __toESM(require("../../../mcpBundle"));
var import_http = require("./http");
var import_tool = require("./tool");
const serverDebug = (0, import_utilsBundle.debug)("pw:mcp:server");
const serverDebugResponse = (0, import_utilsBundle.debug)("pw:mcp:server:response");
class BackendManager {
  constructor() {
    this._backends = /* @__PURE__ */ new Map();
  }
  async createBackend(factory, clientInfo) {
    const backend = await factory.create(clientInfo);
    await backend.initialize?.(clientInfo);
    this._backends.set(backend, factory);
    return backend;
  }
  async disposeBackend(backend) {
    const factory = this._backends.get(backend);
    if (!factory)
      return;
    await backend.dispose?.();
    await factory.disposed(backend).catch(serverDebug);
    this._backends.delete(backend);
  }
}
const backendManager = new BackendManager();
async function connect(factory, transport, runHeartbeat) {
  const server = createServer(factory.name, factory.version, factory, runHeartbeat);
  await server.connect(transport);
}
function createServer(name, version, factory, runHeartbeat) {
  const server = new mcpBundle.Server({ name, version }, {
    capabilities: {
      tools: {}
    }
  });
  server.setRequestHandler(mcpBundle.ListToolsRequestSchema, async () => {
    serverDebug("listTools");
    return { tools: factory.toolSchemas.map((s) => (0, import_tool.toMcpTool)(s)) };
  });
  let backendPromise;
  const onClose = () => backendPromise?.then((b) => backendManager.disposeBackend(b)).catch(serverDebug);
  addServerListener(server, "close", onClose);
  server.setRequestHandler(mcpBundle.CallToolRequestSchema, async (request, extra) => {
    serverDebug("callTool", request);
    const progressToken = request.params._meta?.progressToken;
    let progressCounter = 0;
    const progress = progressToken ? (params) => {
      extra.sendNotification({
        method: "notifications/progress",
        params: {
          progressToken,
          progress: params.progress ?? ++progressCounter,
          total: params.total,
          message: params.message
        }
      }).catch((e) => serverDebug("notification", e));
    } : () => {
    };
    try {
      if (!backendPromise) {
        backendPromise = initializeServer(server, factory, runHeartbeat).catch((e) => {
          backendPromise = void 0;
          throw e;
        });
      }
      const backend = await backendPromise;
      const toolResult = await backend.callTool(request.params.name, request.params.arguments || {}, progress);
      if (toolResult.isClose) {
        await backendManager.disposeBackend(backend).catch(serverDebug);
        backendPromise = void 0;
        delete toolResult.isClose;
      }
      const mergedResult = mergeTextParts(toolResult);
      serverDebugResponse("callResult", mergedResult);
      return mergedResult;
    } catch (error) {
      return {
        content: [{ type: "text", text: "### Error\n" + String(error) }],
        isError: true
      };
    }
  });
  return server;
}
const initializeServer = async (server, factory, runHeartbeat) => {
  const capabilities = server.getClientCapabilities();
  let clientRoots = [];
  if (capabilities?.roots) {
    const { roots } = await server.listRoots().catch((e) => {
      serverDebug(e);
      return { roots: [] };
    });
    clientRoots = roots;
  }
  const clientInfo = {
    cwd: firstRootPath(clientRoots)
  };
  const backend = await backendManager.createBackend(factory, clientInfo);
  if (runHeartbeat)
    startHeartbeat(server);
  return backend;
};
const startHeartbeat = (server) => {
  const beat = () => {
    Promise.race([
      server.ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("ping timeout")), 5e3))
    ]).then(() => {
      setTimeout(beat, 3e3);
    }).catch(() => {
      void server.close();
    });
  };
  beat();
};
function addServerListener(server, event, listener) {
  const oldListener = server[`on${event}`];
  server[`on${event}`] = () => {
    oldListener?.();
    listener();
  };
}
async function start(serverBackendFactory, options = {}) {
  if (options.port === void 0) {
    await connect(serverBackendFactory, new mcpBundle.StdioServerTransport(), false);
    return;
  }
  const url = await (0, import_http.startMcpHttpServer)(options, serverBackendFactory, options.allowedHosts);
  const mcpConfig = { mcpServers: {} };
  mcpConfig.mcpServers[serverBackendFactory.nameInConfig] = {
    url: `${url}/mcp`
  };
  const message = [
    `Listening on ${url}`,
    "Put this in your client config:",
    JSON.stringify(mcpConfig, void 0, 2),
    "For legacy SSE transport support, you can use the /sse endpoint instead."
  ].join("\n");
  console.error(message);
}
function firstRootPath(roots) {
  return allRootPaths(roots)[0];
}
function allRootPaths(roots) {
  const paths = [];
  for (const root of roots) {
    const url = new URL(root.uri);
    let rootPath;
    try {
      rootPath = (0, import_url.fileURLToPath)(url);
    } catch (e) {
      if (e.code === "ERR_INVALID_FILE_URL_PATH" && process.platform === "win32")
        rootPath = decodeURIComponent(url.pathname);
    }
    if (!rootPath)
      continue;
    paths.push(rootPath);
  }
  if (paths.length === 0)
    paths.push(process.cwd());
  return paths;
}
function mergeTextParts(result) {
  const content = [];
  const testParts = [];
  for (const part of result.content) {
    if (part.type === "text") {
      testParts.push(part.text);
      continue;
    }
    if (testParts.length > 0) {
      content.push({ type: "text", text: testParts.join("\n") });
      testParts.length = 0;
    }
    content.push(part);
  }
  if (testParts.length > 0)
    content.push({ type: "text", text: testParts.join("\n") });
  return {
    ...result,
    content
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  allRootPaths,
  connect,
  createServer,
  firstRootPath,
  start
});
