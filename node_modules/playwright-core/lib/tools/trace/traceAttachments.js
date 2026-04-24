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
var traceAttachments_exports = {};
__export(traceAttachments_exports, {
  traceAttachment: () => traceAttachment,
  traceAttachments: () => traceAttachments
});
module.exports = __toCommonJS(traceAttachments_exports);
var import_traceUtils = require("./traceUtils");
async function traceAttachments() {
  const trace = await (0, import_traceUtils.loadTrace)();
  if (!trace.model.attachments.length) {
    console.log("  No attachments");
    return;
  }
  console.log(`  ${"#".padStart(4)} ${"Name".padEnd(40)} ${"Content-Type".padEnd(30)} ${"Action".padEnd(8)}`);
  console.log(`  ${"\u2500".repeat(4)} ${"\u2500".repeat(40)} ${"\u2500".repeat(30)} ${"\u2500".repeat(8)}`);
  for (let i = 0; i < trace.model.attachments.length; i++) {
    const a = trace.model.attachments[i];
    const actionOrdinal = trace.callIdToOrdinal.get(a.callId);
    console.log(`  ${(i + 1 + ".").padStart(4)} ${a.name.padEnd(40)} ${a.contentType.padEnd(30)} ${(actionOrdinal !== void 0 ? String(actionOrdinal) : a.callId).padEnd(8)}`);
  }
}
async function traceAttachment(attachmentId, options) {
  const trace = await (0, import_traceUtils.loadTrace)();
  const ordinal = parseInt(attachmentId, 10);
  const attachment = !isNaN(ordinal) && ordinal >= 1 && ordinal <= trace.model.attachments.length ? trace.model.attachments[ordinal - 1] : void 0;
  if (!attachment) {
    console.error(`Attachment '${attachmentId}' not found. Use 'trace attachments' to see available attachments.`);
    process.exitCode = 1;
    return;
  }
  let content;
  if (attachment.sha1) {
    const blob = await trace.loader.resourceForSha1(attachment.sha1);
    if (blob)
      content = Buffer.from(await blob.arrayBuffer());
  } else if (attachment.base64) {
    content = Buffer.from(attachment.base64, "base64");
  }
  if (!content) {
    console.error(`Could not extract attachment content.`);
    process.exitCode = 1;
    return;
  }
  const outFile = await (0, import_traceUtils.saveOutputFile)(attachment.name, content, options.output);
  console.log(`  Attachment saved to ${outFile}`);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  traceAttachment,
  traceAttachments
});
