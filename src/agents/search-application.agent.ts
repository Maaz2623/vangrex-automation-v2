import { tool, ToolLoopAgent } from "ai";
import { aiModel } from "../ai/model";
import z from "zod";
import { Desktop } from "@mediar-ai/terminator";
import * as Terminator from "@mediar-ai/terminator";

export const searchApplicationAgent = new ToolLoopAgent({
  model: aiModel,
  instructions:
    "Search Windows Search for the requested application. If it appears as an App result, open it. Ignore Web search results. If no matching App result exists, report that the application was not found.",
  tools: {
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

        const escapeRegExp = (value: string) =>
          value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

        const escapedName = escapeRegExp(applicationName);

        const appResultPattern = new RegExp(
          `\\[ListItem\\]\\s+${escapedName}\\s*,\\s*App\\b`,
          "i",
        );

        if (!appResultPattern.test(formattedTree as string)) {
          return `Could not find "${applicationName}" in Windows Search Apps. It may not be installed.`;
        }

        const openButtonLocator = desktop.locator("role:Button|name:Open");

        try {
          const openButton = await openButtonLocator.first(3000);
          await openButton.click();

          return `Clicked Open for "${applicationName}".`;
        } catch {
          return `Found "${applicationName}" in Apps, but could not find or click its Open button.`;
        }
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
