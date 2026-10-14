import { Desktop } from "@mediar-ai/terminator";
import { tool } from "ai";
import z from "zod";
import * as Terminator from "@mediar-ai/terminator";

export const searchInBrowser = tool({
  description: "Used to search for something in the search box",
  inputSchema: z.object({
    elementName: z
      .string()
      .describe("Name of the element. Fetched form the UI Tree"),
    elementRole: z
      .string()
      .describe("Role of the element. Fetched from the UI Tree."),
    query: z.string().describe("The query to search in browser window"),
    websiteName: z
      .string()
      .describe(
        "The text input to target if asked to search inside a website. This is optional.",
      )
      .optional(),
  }),
  execute: async ({ query, websiteName, elementName, elementRole }) => {
    const desktop = new Desktop();

    const browser = await desktop.getCurrentBrowserWindow();

    browser.maximizeWindow();

    const element = await browser
      .locator(`role:${elementRole}|name:${elementName}`)
      .first(5000);

    await element.focus();

    const type = await element.typeText(query);

    if (!type.success) {
      return {
        message: "Could not search.",
      };
    }

    element.pressKey(`{Enter}`);

    await new Promise((resolve) => setTimeout(resolve, 2000));

    element.pressKey(`{Escape}`);

    return {
      message: `Searched for ${query}`,
      uiDiff: type.uiDiff,
    };
  },
});

export const getBrowserUiTree = tool({
  description: "Use to get the browser ui tree.",
  inputSchema: z.object({}),
  execute: async () => {
    const desktop = new Desktop();
    const notepad = await desktop.getCurrentApplication();
    const tree = await desktop.getWindowTreeResult(
      notepad.processName(),
      undefined,
      {
        formatOutput: true,
        propertyMode: Terminator.PropertyLoadingMode.Complete,
        treeOutputFormat: Terminator.TreeOutputFormat.CompactYaml,
      },
    );

    return {
      message: "Tree fetched.",
      UiTree: tree.formatted,
    };
  },
});

export const clickBrowserElements = tool({
  description:
    "Use to perform actions that require clicking in the current browser.",
  inputSchema: z.object({
    elementRole: z
      .string()
      .describe("the role of the element fetched from the ui tree"),
    elementName: z
      .string()
      .describe("Name of the element fetched from Ui tree"),
    clickType: z
      .enum(["Right", "Left", "Double"])
      .describe("The type of click to make")
      .optional(),
  }),
  execute: async ({ elementName, elementRole, clickType }) => {
    const desktop = new Desktop();

    const browser = await desktop.getCurrentBrowserWindow();

    const element = await browser
      .locator(`role:${elementRole}|name:${elementName}`)
      .first(5000);

    if (!element.isFocused) {
      element.focus();
    }
    const click = await element.click();
    return {
      message: `Agent Clicked ${elementName}`,
      actionResult: { ...click },
    };
  },
});
