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
var traceRequests_exports = {};
__export(traceRequests_exports, {
  traceRequest: () => traceRequest,
  traceRequests: () => traceRequests
});
module.exports = __toCommonJS(traceRequests_exports);
var import_path = __toESM(require("path"));
var import_traceUtils = require("./traceUtils");
var import_formatUtils = require("../../utils/isomorphic/formatUtils");
async function traceRequests(options) {
  const trace = await (0, import_traceUtils.loadTrace)();
  const model = trace.model;
  let indexed = model.resources.map((r, i) => ({ resource: r, ordinal: i + 1 }));
  if (options.grep) {
    const pattern = new RegExp(options.grep, "i");
    indexed = indexed.filter(({ resource: r }) => pattern.test(r.request.url));
  }
  if (options.method)
    indexed = indexed.filter(({ resource: r }) => r.request.method.toLowerCase() === options.method.toLowerCase());
  if (options.status) {
    const code = parseInt(options.status, 10);
    indexed = indexed.filter(({ resource: r }) => r.response.status === code);
  }
  if (options.failed)
    indexed = indexed.filter(({ resource: r }) => r.response.status >= 400 || r.response.status === -1);
  if (!indexed.length) {
    console.log("  No network requests");
    return;
  }
  console.log(`  ${"#".padStart(4)} ${"Method".padEnd(8)} ${"Status".padEnd(8)} ${"Name".padEnd(45)} ${"Duration".padStart(10)} ${"Size".padStart(8)} ${"Route".padEnd(10)}`);
  console.log(`  ${"\u2500".repeat(4)} ${"\u2500".repeat(8)} ${"\u2500".repeat(8)} ${"\u2500".repeat(45)} ${"\u2500".repeat(10)} ${"\u2500".repeat(8)} ${"\u2500".repeat(10)}`);
  for (const { resource: r, ordinal } of indexed) {
    let name;
    try {
      const url = new URL(r.request.url);
      name = url.pathname.substring(url.pathname.lastIndexOf("/") + 1);
      if (!name)
        name = url.host;
      if (url.search)
        name += url.search;
    } catch {
      name = r.request.url;
    }
    if (name.length > 45)
      name = name.substring(0, 42) + "...";
    const status = r.response.status > 0 ? String(r.response.status) : "ERR";
    const size = r.response._transferSize > 0 ? r.response._transferSize : r.response.bodySize;
    const route = formatRouteStatus(r);
    console.log(`  ${(ordinal + ".").padStart(4)} ${r.request.method.padEnd(8)} ${status.padEnd(8)} ${name.padEnd(45)} ${(0, import_formatUtils.msToString)(r.time).padStart(10)} ${bytesToString(size).padStart(8)} ${route.padEnd(10)}`);
  }
}
async function traceRequest(requestId) {
  const trace = await (0, import_traceUtils.loadTrace)();
  const model = trace.model;
  const ordinal = parseInt(requestId, 10);
  const resource = !isNaN(ordinal) && ordinal >= 1 && ordinal <= model.resources.length ? model.resources[ordinal - 1] : void 0;
  if (!resource) {
    console.error(`Request '${requestId}' not found. Use 'trace requests' to see available request IDs.`);
    process.exitCode = 1;
    return;
  }
  const r = resource;
  const status = r.response.status > 0 ? `${r.response.status} ${r.response.statusText}` : "ERR";
  const size = r.response._transferSize > 0 ? r.response._transferSize : r.response.bodySize;
  console.log(`
  ${r.request.method} ${r.request.url}
`);
  console.log("  General");
  console.log(`    status:    ${status}`);
  console.log(`    duration:  ${(0, import_formatUtils.msToString)(r.time)}`);
  console.log(`    size:      ${bytesToString(size)}`);
  if (r.response.content.mimeType)
    console.log(`    type:      ${r.response.content.mimeType}`);
  const route = formatRouteStatus(r);
  if (route)
    console.log(`    route:     ${route}`);
  if (r.serverIPAddress)
    console.log(`    server:    ${r.serverIPAddress}${r._serverPort ? ":" + r._serverPort : ""}`);
  if (r.response._failureText)
    console.log(`    error:     ${r.response._failureText}`);
  if (r.request.headers.length) {
    console.log("\n  Request headers");
    for (const h of r.request.headers)
      console.log(`    ${h.name}: ${h.value}`);
  }
  if (r.request.postData) {
    console.log("\n  Request body");
    const resource2 = r.request.postData._sha1 ?? r.request.postData._file;
    if (resource2) {
      console.log(`    ${import_path.default.relative(process.cwd(), import_path.default.join(trace.model.traceUri, "resources", resource2))}`);
    } else {
      const text = r.request.postData.text.length > 2e3 ? r.request.postData.text.substring(0, 2e3) + "..." : r.request.postData.text;
      console.log(`    ${text}`);
    }
  }
  if (r.response.headers.length) {
    console.log("\n  Response headers");
    for (const h of r.response.headers)
      console.log(`    ${h.name}: ${h.value}`);
  }
  if (r.response.bodySize > 0) {
    const resource2 = r.response.content._sha1 ?? r.response.content._file;
    if (resource2) {
      console.log("\n  Response body");
      console.log(`    ${import_path.default.relative(process.cwd(), import_path.default.join(trace.model.traceUri, "resources", resource2))}`);
    } else if (r.response.content.text) {
      const text = r.response.content.text.length > 2e3 ? r.response.content.text.substring(0, 2e3) + "..." : r.response.content.text;
      console.log("\n  Response body");
      console.log(`    ${text}`);
    }
  }
  if (r._securityDetails) {
    console.log("\n  Security");
    if (r._securityDetails.protocol)
      console.log(`    protocol:  ${r._securityDetails.protocol}`);
    if (r._securityDetails.subjectName)
      console.log(`    subject:   ${r._securityDetails.subjectName}`);
    if (r._securityDetails.issuer)
      console.log(`    issuer:    ${r._securityDetails.issuer}`);
  }
  console.log("");
}
function bytesToString(bytes) {
  if (bytes < 0 || !isFinite(bytes))
    return "-";
  if (bytes === 0)
    return "0";
  if (bytes < 1e3)
    return bytes.toFixed(0);
  const kb = bytes / 1024;
  if (kb < 1e3)
    return kb.toFixed(1) + "K";
  const mb = kb / 1024;
  if (mb < 1e3)
    return mb.toFixed(1) + "M";
  const gb = mb / 1024;
  return gb.toFixed(1) + "G";
}
function formatRouteStatus(r) {
  if (r._wasAborted)
    return "aborted";
  if (r._wasContinued)
    return "continued";
  if (r._wasFulfilled)
    return "fulfilled";
  if (r._apiRequest)
    return "api";
  return "";
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  traceRequest,
  traceRequests
});
