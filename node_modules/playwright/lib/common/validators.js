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
var validators_exports = {};
__export(validators_exports, {
  validateTestDetails: () => validateTestDetails
});
module.exports = __toCommonJS(validators_exports);
var import_utils = require("playwright-core/lib/utils");
const testAnnotationSchema = {
  type: "object",
  properties: {
    type: { type: "string" },
    description: { type: "string" }
  },
  required: ["type"]
};
const testDetailsSchema = {
  type: "object",
  properties: {
    tag: {
      oneOf: [
        { type: "string", pattern: "^@", patternError: "Tag must start with '@'" },
        { type: "array", items: { type: "string", pattern: "^@", patternError: "Tag must start with '@'" } }
      ]
    },
    annotation: {
      oneOf: [
        testAnnotationSchema,
        { type: "array", items: testAnnotationSchema }
      ]
    }
  }
};
function validateTestDetails(details, location) {
  const errors = (0, import_utils.validate)(details, testDetailsSchema, "details");
  if (errors.length)
    throw new Error(errors.join("\n"));
  const obj = details;
  const tag = obj.tag;
  const tags = tag === void 0 ? [] : typeof tag === "string" ? [tag] : tag;
  const annotation = obj.annotation;
  const annotations = annotation === void 0 ? [] : Array.isArray(annotation) ? annotation : [annotation];
  return {
    annotations: annotations.map((a) => ({ ...a, location })),
    tags,
    location
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  validateTestDetails
});
