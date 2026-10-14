import { tool, ToolLoopAgent } from "ai";
import { aiModel } from "../../ai/model";
import { searchInBrowser } from "./browser-operator.tools";
import z from "zod";

export const browserAgent = new ToolLoopAgent({
  instructions:
    "You operate the browser, like operating sites, clicking button, searching and also operating the entire browser window including settings and stuff",
  model: aiModel,
  tools: {
    search: searchInBrowser,
  },
});

export const browserAgentTool = tool({
  description: "USe this tool to perform browser actions.",
  inputSchema: z.object({
    task: z.string().describe("The task to perform in browser"),
  }),
  execute: async ({ task }) => {
    const result = await browserAgent.generate({
      prompt: task,
    });

    return {
      browserAgentMessage: result.text,
    };
  },
});
