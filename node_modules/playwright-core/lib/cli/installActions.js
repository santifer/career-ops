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
var installActions_exports = {};
__export(installActions_exports, {
  installBrowsers: () => installBrowsers,
  installDeps: () => installDeps,
  markDockerImage: () => markDockerImage,
  registry: () => import_server.registry,
  uninstallBrowsers: () => uninstallBrowsers
});
module.exports = __toCommonJS(installActions_exports);
var import_path = __toESM(require("path"));
var import_server = require("../server");
var import_utils = require("../utils");
var import_utils2 = require("../utils");
var import_ascii = require("../server/utils/ascii");
function printInstalledBrowsers(browsers) {
  const browserPaths = /* @__PURE__ */ new Set();
  for (const browser of browsers)
    browserPaths.add(browser.browserPath);
  console.log(`  Browsers:`);
  for (const browserPath of [...browserPaths].sort())
    console.log(`    ${browserPath}`);
  console.log(`  References:`);
  const references = /* @__PURE__ */ new Set();
  for (const browser of browsers)
    references.add(browser.referenceDir);
  for (const reference of [...references].sort())
    console.log(`    ${reference}`);
}
function printGroupedByPlaywrightVersion(browsers) {
  const dirToVersion = /* @__PURE__ */ new Map();
  for (const browser of browsers) {
    if (dirToVersion.has(browser.referenceDir))
      continue;
    const packageJSON = require(import_path.default.join(browser.referenceDir, "package.json"));
    const version = packageJSON.version;
    dirToVersion.set(browser.referenceDir, version);
  }
  const groupedByPlaywrightMinorVersion = /* @__PURE__ */ new Map();
  for (const browser of browsers) {
    const version = dirToVersion.get(browser.referenceDir);
    let entries = groupedByPlaywrightMinorVersion.get(version);
    if (!entries) {
      entries = [];
      groupedByPlaywrightMinorVersion.set(version, entries);
    }
    entries.push(browser);
  }
  const sortedVersions = [...groupedByPlaywrightMinorVersion.keys()].sort((a, b) => {
    const aComponents = a.split(".");
    const bComponents = b.split(".");
    const aMajor = parseInt(aComponents[0], 10);
    const bMajor = parseInt(bComponents[0], 10);
    if (aMajor !== bMajor)
      return aMajor - bMajor;
    const aMinor = parseInt(aComponents[1], 10);
    const bMinor = parseInt(bComponents[1], 10);
    if (aMinor !== bMinor)
      return aMinor - bMinor;
    return aComponents.slice(2).join(".").localeCompare(bComponents.slice(2).join("."));
  });
  for (const version of sortedVersions) {
    console.log(`
Playwright version: ${version}`);
    printInstalledBrowsers(groupedByPlaywrightMinorVersion.get(version));
  }
}
async function markDockerImage(dockerImageNameTemplate) {
  (0, import_utils2.assert)(dockerImageNameTemplate, "dockerImageNameTemplate is required");
  await (0, import_server.writeDockerVersion)(dockerImageNameTemplate);
}
async function installBrowsers(args, options) {
  if ((0, import_utils.isLikelyNpxGlobal)()) {
    console.error((0, import_ascii.wrapInASCIIBox)([
      `WARNING: It looks like you are running 'npx playwright install' without first`,
      `installing your project's dependencies.`,
      ``,
      `To avoid unexpected behavior, please install your dependencies first, and`,
      `then run Playwright's install command:`,
      ``,
      `    npm install`,
      `    npx playwright install`,
      ``,
      `If your project does not yet depend on Playwright, first install the`,
      `applicable npm package (most commonly @playwright/test), and`,
      `then run Playwright's install command to download the browsers:`,
      ``,
      `    npm install @playwright/test`,
      `    npx playwright install`,
      ``
    ].join("\n"), 1));
  }
  if (options.shell === false && options.onlyShell)
    throw new Error(`Only one of --no-shell and --only-shell can be specified`);
  const shell = options.shell === false ? "no" : options.onlyShell ? "only" : void 0;
  const executables = import_server.registry.resolveBrowsers(args, { shell });
  if (options.withDeps)
    await import_server.registry.installDeps(executables, !!options.dryRun);
  if (options.dryRun && options.list)
    throw new Error(`Only one of --dry-run and --list can be specified`);
  if (options.dryRun) {
    for (const executable of executables) {
      console.log(import_server.registry.calculateDownloadTitle(executable));
      console.log(`  Install location:    ${executable.directory ?? "<system>"}`);
      if (executable.downloadURLs?.length) {
        const [url, ...fallbacks] = executable.downloadURLs;
        console.log(`  Download url:        ${url}`);
        for (let i = 0; i < fallbacks.length; ++i)
          console.log(`  Download fallback ${i + 1}: ${fallbacks[i]}`);
      }
      console.log(``);
    }
  } else if (options.list) {
    const browsers = await import_server.registry.listInstalledBrowsers();
    printGroupedByPlaywrightVersion(browsers);
  } else {
    await import_server.registry.install(executables, { force: options.force });
    await import_server.registry.validateHostRequirementsForExecutablesIfNeeded(executables, process.env.PW_LANG_NAME || "javascript").catch((e) => {
      e.name = "Playwright Host validation warning";
      console.error(e);
    });
  }
}
async function uninstallBrowsers(options) {
  delete process.env.PLAYWRIGHT_SKIP_BROWSER_GC;
  await import_server.registry.uninstall(!!options.all).then(({ numberOfBrowsersLeft }) => {
    if (!options.all && numberOfBrowsersLeft > 0) {
      console.log("Successfully uninstalled Playwright browsers for the current Playwright installation.");
      console.log(`There are still ${numberOfBrowsersLeft} browsers left, used by other Playwright installations.
To uninstall Playwright browsers for all installations, re-run with --all flag.`);
    }
  });
}
async function installDeps(args, options) {
  await import_server.registry.installDeps(import_server.registry.resolveBrowsers(args, {}), !!options.dryRun);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  installBrowsers,
  installDeps,
  markDockerImage,
  registry,
  uninstallBrowsers
});
