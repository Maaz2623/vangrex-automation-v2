import { isStepCount, ToolLoopAgent } from "ai";
import { aiModel } from "../ai/model";
import { searchApplicationTool } from "./search-application.agent";
import { windowManagerAgentTool } from "./window-manager.agent";
import { vscodeOperatorAgentTool } from "./vscode-operator.agent";
import { google } from "@ai-sdk/google";
import { notepadOperatorAgentTool } from "./notepad-operator/notepad-operator.agent";
import { browserAgentTool } from "./browser-operator/browser-operator.agent";

export const mainAgent = new ToolLoopAgent({
  model: aiModel,
  tools: {
    searchApplication: searchApplicationTool,
    windowManagement: windowManagerAgentTool,
    notepadOperatorAgent: notepadOperatorAgentTool,
    vscodeOperatorAgent: vscodeOperatorAgentTool,
    browserAgent: browserAgentTool,
  },
  stopWhen: isStepCount(100),
  instructions: ` You are a desktop assistant.
      Always use the searchApplication tool when the user asks to open an application.
      Read the tool result carefully.
      If the tool says the application was not found, clearly tell the user that
      the application was not found and may not be installed.
      Never claim an application was opened if the tool did not confirm the open action.
      Keep your response concise.
      Use the window manager tool to perform actions like minimize, maximize, restore or close.

      If user wants to get things done related to creating text files or something. Intelligently Understand and use notepadOperatorAgent.

      If user wants to operate vscode. Use the vscodeOperatorAgent.

      If user wants to operate browser related stuff. use the browserAgent
      `,
});
