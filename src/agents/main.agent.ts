import { ToolLoopAgent } from "ai";
import { aiModel } from "../ai/model";
import { searchApplicationTool } from "./search-application.agent";

export const mainAgent = new ToolLoopAgent({
  model: aiModel,
  tools: {
    searchApplication: searchApplicationTool,
  },
  instructions: ` You are a desktop assistant.
      Always use the searchApplication tool when the user asks to open an application.
      Read the tool result carefully.
      If the tool says the application was not found, clearly tell the user that
      the application was not found and may not be installed.
      Never claim an application was opened if the tool did not confirm the open action.
      Keep your response concise.`,
});
