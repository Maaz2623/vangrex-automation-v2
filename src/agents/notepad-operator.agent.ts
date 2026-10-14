import { isStepCount, tool, ToolLoopAgent } from "ai";
import { aiModel } from "../ai/model";
import { searchApplicationTool } from "./search-application.agent";
import z from "zod";
import { Desktop } from "@mediar-ai/terminator";
import * as Terminator from "@mediar-ai/terminator";
import { NOTEPAD_AGENT_INSTRUCTIONS } from "./notepad-operator.agent.instructions";

export const notepadOperatorAgent = new ToolLoopAgent({
  model: aiModel,
  instructions: NOTEPAD_AGENT_INSTRUCTIONS,
  stopWhen: isStepCount(100),
  tools: {
    // searchAndOpenNotepad: searchApplicationTool,
    clickElements: tool({
      description:
        "Use to perform actions that require clicking in notepad, such as saving file and formatting text and other stuff.",
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
      description: "Use to type text in the notepad editor",
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
        desktop.hideInspectOverlay();
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
          actionResult: { ...type },
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
    getTextValue: tool({
      description:
        "Used to get the currently opened editor or document text. Usually run before making any actions but after getting UI tree. also to verify if typing is correct.",
      inputSchema: z.object({
        elementRole: z
          .string()
          .describe(
            "the role of the element that should be focused to read the text from.",
          ),
        elementName: z
          .string()
          .describe(
            "Name of the element fetched from Ui tree. To read the text from.",
          ),
      }),
      execute: async ({ elementRole, elementName }) => {
        const desktop = new Desktop();
        const notepad = await desktop.getCurrentApplication();
        const element = await notepad
          .locator(`role:${elementRole}|name:${elementName}`)
          .first(2000);

        const value = element.getValue();

        return {
          message: "Successfully recieved value",
          value: value,
        };
      },
    }),
  },
});

export const notepadOperatorAgentTool = tool({
  description:
    "You operate notepad. eg: New tab, typing text, text formatting and everything. toolbar management. file saving etc.",
  inputSchema: z.object({
    task: z.string().describe("The task to accomplish in notepad"),
  }),
  execute: async ({ task }) => {
    const result = await notepadOperatorAgent.generate({
      prompt: task,
    });

    return result.text;
  },
});
