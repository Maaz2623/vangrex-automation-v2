import { WorkflowAgent } from "@ai-sdk/workflow";
import { aiModel } from "../ai/model";
import { ToolLoopAgent } from "ai";

export const notepadAgent = new ToolLoopAgent({
  model: aiModel,
  instructions: "You Operate notepad application. Only if it is opened.",
  tools: {},
});
