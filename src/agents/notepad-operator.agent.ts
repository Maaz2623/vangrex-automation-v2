import { ToolLoopAgent } from "ai";
import { aiModel } from "../ai/model";


export const notepadOperatorAgent = new ToolLoopAgent({
    model: aiModel,
    
})