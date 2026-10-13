import { tool, ToolLoopAgent } from "ai";
import { aiModel } from "../ai/model";
import z from "zod";
import { Desktop } from "@mediar-ai/terminator";
import * as Terminator from "@mediar-ai/terminator";

export const windowManagerAgent = new ToolLoopAgent({
  model: aiModel,
  instructions:
    "You manage the window of applications. like minimize, maximize and close.",
  tools: {
    minimizeApplication: tool({
      description: "Used to minimize the current application",
      inputSchema: z.object({
        action: z.enum(["Minimize", "Close", "Maximize", "Restore"]),
      }),

      execute: async ({ action }) => {
        const desktop = new Desktop();

        const currentWindow = await desktop.getCurrentApplication();

        switch (action) {
          case "Close":
            currentWindow.close();
            break;
          case "Maximize":
            currentWindow.maximizeWindow();
            break;
          case "Minimize":
            currentWindow.minimizeWindow();
            break;
          case "Restore":
            const restoreButton = await desktop
              .locator(`role:Button|name:Restore`)
              .first(2000);
            await restoreButton.click();
        }

        return {
          message: `${action} action completed.`,
        };
      },
    }),
  },
});

export const windowManagerAgentTool = tool({
  description:
    "Used to perform actions on window such as minimize, maximize, restore or close",
  inputSchema: z.object({
    action: z.enum(["Minimize", "Close", "Maximize", "Restore"]),
  }),
  execute: async ({ action }) => {
    const result = await windowManagerAgent.generate({
      prompt: `Perform this window action: ${action}. on the window`,
    });

    return result.text;
  },
});
