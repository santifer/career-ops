"use strict";
var import_utilsBundle = require("../../utilsBundle");
var import_program = require("./program");
const packageJSON = require("../../../package.json");
const p = import_utilsBundle.program.version("Version " + packageJSON.version).name("Playwright MCP");
(0, import_program.decorateMCPCommand)(p);
void import_utilsBundle.program.parseAsync(process.argv);
