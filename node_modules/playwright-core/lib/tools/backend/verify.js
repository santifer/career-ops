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
var verify_exports = {};
__export(verify_exports, {
  default: () => verify_default
});
module.exports = __toCommonJS(verify_exports);
var import_zodBundle = require("../../zodBundle");
var import_stringUtils = require("../../utils/isomorphic/stringUtils");
var import_tool = require("./tool");
const verifyElement = (0, import_tool.defineTabTool)({
  capability: "testing",
  schema: {
    name: "browser_verify_element_visible",
    title: "Verify element visible",
    description: "Verify element is visible on the page",
    inputSchema: import_zodBundle.z.object({
      role: import_zodBundle.z.string().describe('ROLE of the element. Can be found in the snapshot like this: `- {ROLE} "Accessible Name":`'),
      accessibleName: import_zodBundle.z.string().describe('ACCESSIBLE_NAME of the element. Can be found in the snapshot like this: `- role "{ACCESSIBLE_NAME}"`')
    }),
    type: "assertion"
  },
  handle: async (tab, params, response) => {
    for (const frame of tab.page.frames()) {
      const locator = frame.getByRole(params.role, { name: params.accessibleName });
      if (await locator.count() > 0) {
        const resolved = await locator.normalize();
        response.addCode(`await expect(page.${resolved}).toBeVisible();`);
        response.addTextResult("Done");
        return;
      }
    }
    response.addError(`Element with role "${params.role}" and accessible name "${params.accessibleName}" not found`);
  }
});
const verifyText = (0, import_tool.defineTabTool)({
  capability: "testing",
  schema: {
    name: "browser_verify_text_visible",
    title: "Verify text visible",
    description: `Verify text is visible on the page. Prefer ${verifyElement.schema.name} if possible.`,
    inputSchema: import_zodBundle.z.object({
      text: import_zodBundle.z.string().describe('TEXT to verify. Can be found in the snapshot like this: `- role "Accessible Name": {TEXT}` or like this: `- text: {TEXT}`')
    }),
    type: "assertion"
  },
  handle: async (tab, params, response) => {
    for (const frame of tab.page.frames()) {
      const locator = frame.getByText(params.text).filter({ visible: true });
      if (await locator.count() > 0) {
        const resolved = await locator.normalize();
        response.addCode(`await expect(page.${resolved}).toBeVisible();`);
        response.addTextResult("Done");
        return;
      }
    }
    response.addError("Text not found");
  }
});
const verifyList = (0, import_tool.defineTabTool)({
  capability: "testing",
  schema: {
    name: "browser_verify_list_visible",
    title: "Verify list visible",
    description: "Verify list is visible on the page",
    inputSchema: import_zodBundle.z.object({
      element: import_zodBundle.z.string().describe("Human-readable list description"),
      ref: import_zodBundle.z.string().describe("Exact target element reference that points to the list"),
      selector: import_zodBundle.z.string().optional().describe('CSS or role selector for the target list, when "ref" is not available.'),
      items: import_zodBundle.z.array(import_zodBundle.z.string()).describe("Items to verify")
    }),
    type: "assertion"
  },
  handle: async (tab, params, response) => {
    const { locator } = await tab.refLocator({ ref: params.ref, selector: params.selector, element: params.element });
    const itemTexts = [];
    for (const item of params.items) {
      const itemLocator = locator.getByText(item);
      if (await itemLocator.count() === 0) {
        response.addError(`Item "${item}" not found`);
        return;
      }
      itemTexts.push(await itemLocator.textContent(tab.expectTimeoutOptions));
    }
    const ariaSnapshot = `\`
- list:
${itemTexts.map((t) => `  - listitem: ${(0, import_stringUtils.escapeWithQuotes)(t, '"')}`).join("\n")}
\``;
    response.addCode(`await expect(page.locator('body')).toMatchAriaSnapshot(${ariaSnapshot});`);
    response.addTextResult("Done");
  }
});
const verifyValue = (0, import_tool.defineTabTool)({
  capability: "testing",
  schema: {
    name: "browser_verify_value",
    title: "Verify value",
    description: "Verify element value",
    inputSchema: import_zodBundle.z.object({
      type: import_zodBundle.z.enum(["textbox", "checkbox", "radio", "combobox", "slider"]).describe("Type of the element"),
      element: import_zodBundle.z.string().describe("Human-readable element description"),
      ref: import_zodBundle.z.string().describe("Exact target element reference from the page snapshot"),
      selector: import_zodBundle.z.string().optional().describe('CSS or role selector for the target element, when "ref" is not available'),
      value: import_zodBundle.z.string().describe('Value to verify. For checkbox, use "true" or "false".')
    }),
    type: "assertion"
  },
  handle: async (tab, params, response) => {
    const { locator, resolved } = await tab.refLocator({ ref: params.ref, selector: params.selector, element: params.element });
    const locatorSource = `page.${resolved}`;
    if (params.type === "textbox" || params.type === "slider" || params.type === "combobox") {
      const value = await locator.inputValue(tab.expectTimeoutOptions);
      if (value !== params.value) {
        response.addError(`Expected value "${params.value}", but got "${value}"`);
        return;
      }
      response.addCode(`await expect(${locatorSource}).toHaveValue(${(0, import_stringUtils.escapeWithQuotes)(params.value)});`);
    } else if (params.type === "checkbox" || params.type === "radio") {
      const value = await locator.isChecked(tab.expectTimeoutOptions);
      if (value !== (params.value === "true")) {
        response.addError(`Expected value "${params.value}", but got "${value}"`);
        return;
      }
      const matcher = value ? "toBeChecked" : "not.toBeChecked";
      response.addCode(`await expect(${locatorSource}).${matcher}();`);
    }
    response.addTextResult("Done");
  }
});
var verify_default = [
  verifyElement,
  verifyText,
  verifyList,
  verifyValue
];
