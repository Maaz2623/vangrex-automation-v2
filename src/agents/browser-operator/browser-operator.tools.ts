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

    await desktop.navigateBrowser(query);

    return {
      message: `Searched for ${query}`,
    };
  },
});
