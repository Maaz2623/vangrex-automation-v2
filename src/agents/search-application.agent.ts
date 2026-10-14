import { tool, ToolLoopAgent } from "ai";
import { aiModel } from "../ai/model";
import z from "zod";
import { Desktop } from "@mediar-ai/terminator";
import * as Terminator from "@mediar-ai/terminator";

export const searchApplicationAgent = new ToolLoopAgent({
  model: aiModel,
  instructions:
    "Search Windows Search for the requested application. If it appears as an App with full app name under result, click it by using clickApplication tool. Ignore Web search results. If no matching App result exists, report that the application was not found.",
  tools: {
    clickApplication: tool({
      description: "Used to click the application if found only.",
      inputSchema: z.object({
        elementName: z
          .string()
          .describe("Can appear as Name of the application searched."),
        elementRole: z
          .string()
          .describe("Can appear as listitem or button or text or anything."),
      }),
      execute: async ({ elementName, elementRole }) => {
        const desktop = new Desktop();

        const element = await desktop
          .locator(`role:${elementRole}|name:${elementName}`)
          .first(5000);

        const clicked = await element.click();

        return {
          message: "Application opened",
          uiDiff: clicked.uiDiff,
        };
      },
    }),
    searchApplication: tool({
      description:
        "Search for an application in Windows Search. Open it only if a matching App result exists. Ignore web results.",
      inputSchema: z.object({
        applicationName: z.string().describe("The application to search"),
      }),
      execute: async ({ applicationName }) => {
        const desktop = new Desktop();

        await desktop.pressKey("Win");

        const searchLocator = desktop.locator("role:Text|name:Search");
        const searchBox = await searchLocator.first(5000);

        await searchBox.typeText(applicationName, {
          clearBeforeTyping: true,
        });

        await new Promise((resolve) => setTimeout(resolve, 1500));

        const searchWindowLocator = desktop.locator("role:Window|name:Search");
        const searchWindow = await searchWindowLocator.first(5000);

        const tree = await desktop.getWindowTreeResult(
          searchWindow.processName(),
          undefined,
          {
            propertyMode: Terminator.PropertyLoadingMode.Smart,
            formatOutput: true,
            treeOutputFormat: Terminator.TreeOutputFormat.CompactYaml,
          },
        );

        const formattedTree = tree.formatted;

        return {
          searchResults: formattedTree,
        };
      },
    }),
  },
});

export const searchApplicationTool = tool({
  description:
    "Search Windows Search for an installed application and open it. Report clearly if the app is not found.",
  inputSchema: z.object({
    applicationName: z.string(),
  }),
  execute: async ({ applicationName }) => {
    const result = await searchApplicationAgent.generate({
      prompt: `Search for "${applicationName}" and open it if it exists as an App result. If it is not found, return exactly: NOT_INSTALLED: ${applicationName}`,
    });

    return result.text;
  },
});
