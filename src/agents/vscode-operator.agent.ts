import { tool, ToolLoopAgent } from "ai";
import { aiModel } from "../ai/model";
import { searchApplicationTool } from "./search-application.agent";
import z from "zod";
import { Desktop } from "@mediar-ai/terminator";
import * as Terminator from "@mediar-ai/terminator";

export const vscodeOperatorAgent = new ToolLoopAgent({
  model: aiModel,
  instructions:
    "You operate notepad. eg: New tab, typing text, text formatting and everything. toolbar management. file saving etc. Use the given tools intelligently",
  tools: {
    // searchAndOpenNotepad: searchApplicationTool,
    clickElements: tool({
      description:
        "Use to perform actions that require clicking in vscode, such as saving file and formatting text and other stuff.",
      inputSchema: z.object({
        elementRole: z
          .string()
          .describe(
            "the role of the element that should be focused to start typing. Something like Edit or Document. ",
          ),
        elementName: z
          .string()
          .describe("Name of the element fetched from Ui tree"),
        clickType: z
          .enum(["Right", "Left", "Double"])
          .describe("The text to type in."),
      }),
      execute: async ({ elementName, elementRole, clickType }) => {
        const desktop = new Desktop();

        const element = await desktop
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
    }),
    typeText: tool({
      description: "Use to type text in the vscode inputs.",
      inputSchema: z.object({
        elementRole: z
          .string()
          .describe(
            "the role of the element that should be focused to start typing. Something like Edit or Document. ",
          ),
        elementName: z
          .string()
          .describe("Name of the element fetched from Ui tree"),
        text: z.string().describe("The text to type in."),
      }),
      execute: async ({ elementRole, elementName, text }) => {
        const desktop = new Desktop();
        const element = await desktop
          .locator(`role:${elementRole}|name:${elementName}`)
          .first(5000);

        if (!element.isFocused) {
          element.focus();
        }

        const type = element.typeText(text);

        if (!type.success) {
          return {
            message: "Failed to type text",
          };
        }

        return {
          message: "Agent completed typing successfully.",
        };
      },
    }),
    getUITree: tool({
      description: "Use to get the notepad ui tree.",
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
    }),
  },
});

export const vscodeOperatorAgentTool = tool({
  description:
    "You operate vscode. eg: New tab, typing text, text formatting and everything. toolbar management. file saving etc. Whatever can be done in vscode.",
  inputSchema: z.object({
    task: z.string().describe("The task to accomplish in vscode"),
  }),
  execute: async ({ task }) => {
    const result = await vscodeOperatorAgent.generate({
      prompt: task,
    });

    return result.text;
  },
});
