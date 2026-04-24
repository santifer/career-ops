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
var junit_exports = {};
__export(junit_exports, {
  default: () => junit_default
});
module.exports = __toCommonJS(junit_exports);
var import_fs = __toESM(require("fs"));
var import_path = __toESM(require("path"));
var import_utils = require("playwright-core/lib/utils");
var import_base = require("./base");
var import_util = require("../util");
class JUnitReporter {
  constructor(options) {
    this.totalTests = 0;
    this.totalFailures = 0;
    this.totalErrors = 0;
    this.totalSkipped = 0;
    this.stripANSIControlSequences = false;
    this.includeProjectInTestName = false;
    this.includeRetries = false;
    this.stripANSIControlSequences = (0, import_utils.getAsBooleanFromENV)("PLAYWRIGHT_JUNIT_STRIP_ANSI", !!options.stripANSIControlSequences);
    this.includeProjectInTestName = (0, import_utils.getAsBooleanFromENV)("PLAYWRIGHT_JUNIT_INCLUDE_PROJECT_IN_TEST_NAME", !!options.includeProjectInTestName);
    this.includeRetries = (0, import_utils.getAsBooleanFromENV)("PLAYWRIGHT_JUNIT_INCLUDE_RETRIES", !!options.includeRetries);
    this.configDir = options.configDir;
    this.resolvedOutputFile = (0, import_base.resolveOutputFile)("JUNIT", options)?.outputFile;
  }
  version() {
    return "v2";
  }
  printsToStdio() {
    return !this.resolvedOutputFile;
  }
  onConfigure(config) {
    this.config = config;
  }
  onBegin(suite) {
    this.suite = suite;
    this.timestamp = /* @__PURE__ */ new Date();
  }
  async onEnd(result) {
    const children = [];
    for (const projectSuite of this.suite.suites) {
      for (const fileSuite of projectSuite.suites)
        children.push(await this._buildTestSuite(projectSuite.title, fileSuite));
    }
    const tokens = [];
    const self = this;
    const root = {
      name: "testsuites",
      attributes: {
        id: process.env[`PLAYWRIGHT_JUNIT_SUITE_ID`] || "",
        name: process.env[`PLAYWRIGHT_JUNIT_SUITE_NAME`] || "",
        tests: self.totalTests,
        failures: self.totalFailures,
        skipped: self.totalSkipped,
        errors: self.totalErrors,
        time: result.duration / 1e3
      },
      children
    };
    serializeXML(root, tokens, this.stripANSIControlSequences);
    const reportString = tokens.join("\n");
    if (this.resolvedOutputFile) {
      await import_fs.default.promises.mkdir(import_path.default.dirname(this.resolvedOutputFile), { recursive: true });
      await import_fs.default.promises.writeFile(this.resolvedOutputFile, reportString);
    } else {
      console.log(reportString);
    }
  }
  async _buildTestSuite(projectName, suite) {
    let tests = 0;
    let skipped = 0;
    let failures = 0;
    let errors = 0;
    let duration = 0;
    const children = [];
    const testCaseNamePrefix = projectName && this.includeProjectInTestName ? `[${projectName}] ` : "";
    for (const test of suite.allTests()) {
      ++tests;
      if (test.outcome() === "skipped")
        ++skipped;
      for (const result of test.results)
        duration += result.duration;
      const classification = await this._addTestCase(suite.title, testCaseNamePrefix, test, children);
      if (classification === "error")
        ++errors;
      else if (classification === "failure")
        ++failures;
    }
    this.totalTests += tests;
    this.totalSkipped += skipped;
    this.totalFailures += failures;
    this.totalErrors += errors;
    const entry = {
      name: "testsuite",
      attributes: {
        name: suite.title,
        timestamp: this.timestamp.toISOString(),
        hostname: projectName,
        tests,
        failures,
        skipped,
        time: duration / 1e3,
        errors
      },
      children
    };
    return entry;
  }
  async _addTestCase(suiteName, namePrefix, test, entries) {
    const entry = {
      name: "testcase",
      attributes: {
        // Skip root, project, file
        name: namePrefix + test.titlePath().slice(3).join(" \u203A "),
        // filename
        classname: suiteName
      },
      children: []
    };
    entries.push(entry);
    const properties = {
      name: "properties",
      children: []
    };
    for (const annotation of test.annotations) {
      const property = {
        name: "property",
        attributes: {
          name: annotation.type,
          value: annotation?.description ? annotation.description : ""
        }
      };
      properties.children?.push(property);
    }
    if (properties.children?.length)
      entry.children.push(properties);
    if (test.outcome() === "skipped") {
      entry.children.push({ name: "skipped" });
      return null;
    }
    if (this.includeRetries && test.ok()) {
      const passResult = test.results[test.results.length - 1];
      entry.attributes.time = passResult.duration / 1e3;
      await this._appendStdIO(entry, [passResult]);
      for (let i = 0; i < test.results.length - 1; i++) {
        const result = test.results[i];
        if (result.status === "passed" || result.status === "skipped")
          continue;
        entry.children.push(await this._buildRetryEntry(result, "flaky"));
      }
      return null;
    }
    if (this.includeRetries) {
      entry.attributes.time = test.results[0].duration / 1e3;
      await this._appendStdIO(entry, [test.results[0]]);
      for (let i = 1; i < test.results.length; i++) {
        const result = test.results[i];
        if (result.status === "passed" || result.status === "skipped")
          continue;
        entry.children.push(await this._buildRetryEntry(result, "rerun"));
      }
      return this._addFailureEntry(test, classifyResultError(test.results[0]), entry);
    }
    entry.attributes.time = test.results.reduce((acc, value) => acc + value.duration, 0) / 1e3;
    await this._appendStdIO(entry, test.results);
    if (test.ok())
      return null;
    return this._addFailureEntry(test, classifyTestError(test), entry);
  }
  _addFailureEntry(test, errorInfo, entry) {
    if (errorInfo) {
      entry.children.push({
        name: errorInfo.elementName,
        attributes: { message: errorInfo.message, type: errorInfo.type },
        text: (0, import_util.stripAnsiEscapes)((0, import_base.formatFailure)(import_base.nonTerminalScreen, this.config, test))
      });
      return errorInfo.elementName;
    }
    entry.children.push({
      name: "failure",
      attributes: {
        message: `${import_path.default.basename(test.location.file)}:${test.location.line}:${test.location.column} ${test.title}`,
        type: "FAILURE"
      },
      text: (0, import_util.stripAnsiEscapes)((0, import_base.formatFailure)(import_base.nonTerminalScreen, this.config, test))
    });
    return "failure";
  }
  async _appendStdIO(entry, results) {
    const systemOut = [];
    const systemErr = [];
    for (const result of results) {
      for (const item of result.stdout)
        systemOut.push(item.toString());
      for (const item of result.stderr)
        systemErr.push(item.toString());
      for (const attachment of result.attachments) {
        if (!attachment.path)
          continue;
        let attachmentPath = import_path.default.relative(this.configDir, attachment.path);
        try {
          if (this.resolvedOutputFile)
            attachmentPath = import_path.default.relative(import_path.default.dirname(this.resolvedOutputFile), attachment.path);
        } catch {
          systemOut.push(`
Warning: Unable to make attachment path ${attachment.path} relative to report output file ${this.resolvedOutputFile}`);
        }
        try {
          await import_fs.default.promises.access(attachment.path);
          systemOut.push(`
[[ATTACHMENT|${attachmentPath}]]
`);
        } catch {
          systemErr.push(`
Warning: attachment ${attachmentPath} is missing`);
        }
      }
    }
    if (systemOut.length)
      entry.children.push({ name: "system-out", text: systemOut.join("") });
    if (systemErr.length)
      entry.children.push({ name: "system-err", text: systemErr.join("") });
  }
  async _buildRetryEntry(result, prefix) {
    const errorInfo = classifyResultError(result);
    const entry = {
      name: `${prefix}${errorInfo?.elementName === "error" ? "Error" : "Failure"}`,
      attributes: { message: errorInfo?.message || "", type: errorInfo?.type || "FAILURE", time: result.duration / 1e3 },
      children: []
    };
    const stackTrace = result.error?.stack || result.error?.message || result.error?.value || "";
    entry.children.push({ name: "stackTrace", text: (0, import_util.stripAnsiEscapes)(stackTrace) });
    await this._appendStdIO(entry, [result]);
    return entry;
  }
}
function classifyResultError(result) {
  const error = result.error;
  if (!error)
    return null;
  const rawMessage = (0, import_util.stripAnsiEscapes)(error.message || error.value || "");
  const nameMatch = rawMessage.match(/^(\w+): /);
  const errorName = nameMatch ? nameMatch[1] : "";
  const messageBody = nameMatch ? rawMessage.slice(nameMatch[0].length) : rawMessage;
  const firstLine = messageBody.split("\n")[0].trim();
  const matcherMatch = rawMessage.match(/expect\(.*?\)\.(not\.)?(\w+)/);
  if (matcherMatch) {
    const matcherName = `expect.${matcherMatch[1] || ""}${matcherMatch[2]}`;
    return {
      elementName: "failure",
      type: matcherName,
      message: firstLine
    };
  }
  return {
    elementName: "error",
    type: errorName || "Error",
    message: firstLine
  };
}
function classifyTestError(test) {
  for (const result of test.results) {
    const info = classifyResultError(result);
    if (info)
      return info;
  }
  return null;
}
function serializeXML(entry, tokens, stripANSIControlSequences) {
  const attrs = [];
  for (const [name, value] of Object.entries(entry.attributes || {}))
    attrs.push(`${name}="${escape(String(value), stripANSIControlSequences, false)}"`);
  tokens.push(`<${entry.name}${attrs.length ? " " : ""}${attrs.join(" ")}>`);
  for (const child of entry.children || [])
    serializeXML(child, tokens, stripANSIControlSequences);
  if (entry.text)
    tokens.push(escape(entry.text, stripANSIControlSequences, true));
  tokens.push(`</${entry.name}>`);
}
const discouragedXMLCharacters = /[\u0000-\u0008\u000b-\u000c\u000e-\u001f\u007f-\u0084\u0086-\u009f]/g;
function escape(text, stripANSIControlSequences, isCharacterData) {
  if (stripANSIControlSequences)
    text = (0, import_util.stripAnsiEscapes)(text);
  if (isCharacterData) {
    text = "<![CDATA[" + text.replace(/]]>/g, "]]&gt;") + "]]>";
  } else {
    const escapeRe = /[&"'<>]/g;
    text = text.replace(escapeRe, (c) => ({ "&": "&amp;", '"': "&quot;", "'": "&apos;", "<": "&lt;", ">": "&gt;" })[c]);
  }
  text = text.replace(discouragedXMLCharacters, "");
  return text;
}
var junit_default = JUnitReporter;
