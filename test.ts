import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { Desktop } from "@mediar-ai/terminator";

const MODEL = "gemini-3.5-flash-lite";
const MAX_STEPS = 20;

const desktop = new Desktop();

type AgentAction =
  | {
      action: "click";
      target: string;
      reason: string;
    }
  | {
      action: "type";
      target: string;
      text: string;
      reason: string;
    }
  | {
      action: "typeFocused";
      text: string;
      reason: string;
    }
  | {
      action: "wait";
      reason: string;
    }
  | {
      action: "done";
      reason: string;
    }
  | {
      action: "stop";
      reason: string;
    };

type AgentContext = {
  task: string;
  step: number;
  previousAction: string;
  history: string[];
};

function extractJson(text: string): AgentAction {
  const start = text.indexOf("{");

  if (start < 0) {
    throw new Error(`No JSON object found in model response:\n${text}`);
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const c = text[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }

    if (c === '"') {
      inString = true;
    } else if (c === "{") {
      depth++;
    } else if (c === "}") {
      depth--;

      if (depth === 0) {
        const parsed: unknown = JSON.parse(text.slice(start, i + 1));

        if (
          typeof parsed !== "object" ||
          parsed === null ||
          !("action" in parsed) ||
          !("reason" in parsed)
        ) {
          throw new Error("Model returned an invalid action object.");
        }

        const value = parsed as Record<string, unknown>;

        if (
          typeof value.action !== "string" ||
          typeof value.reason !== "string"
        ) {
          throw new Error("Action and reason must be strings.");
        }

        switch (value.action) {
          case "click":
            if (typeof value.target !== "string" || !value.target.trim()) {
              throw new Error("click requires a non-empty target.");
            }
            return {
              action: "click",
              target: value.target,
              reason: value.reason,
            };

          case "type":
            if (
              typeof value.target !== "string" ||
              !value.target.trim() ||
              typeof value.text !== "string"
            ) {
              throw new Error("type requires target and text.");
            }
            return {
              action: "type",
              target: value.target,
              text: value.text,
              reason: value.reason,
            };

          case "typeFocused":
            if (typeof value.text !== "string") {
              throw new Error("typeFocused requires text.");
            }
            return {
              action: "typeFocused",
              text: value.text,
              reason: value.reason,
            };

          case "wait":
          case "done":
          case "stop":
            return {
              action: value.action,
              reason: value.reason,
            };

          default:
            throw new Error(`Unsupported action: ${value.action}`);
        }
      }
    }
  }

  throw new Error("Incomplete JSON object in model response.");
}

async function captureScreen(): Promise<Uint8Array> {
  const monitor = await desktop.getPrimaryMonitor();
  const screenshot = await desktop.captureMonitor(monitor);

  return new Uint8Array(desktop.screenshotToPng(screenshot));
}

function buildPrompt(context: AgentContext): string {
  return `
You are a general-purpose Windows desktop automation agent.

USER TASK:
${context.task}

CURRENT STEP: ${context.step} of ${MAX_STEPS}

PREVIOUS ACTION:
${context.previousAction}

ACTION HISTORY:
${context.history.slice(-6).join("\n") || "No actions yet."}

You will receive a screenshot of the current desktop.

Decide the SINGLE best next action based on:
1. The user's task.
2. What is actually visible in the screenshot.
3. The previous action and whether it appears to have worked.

GENERAL RULES:
- Do not assume a particular application is open.
- Do not assume a fixed sequence of screens or menus.
- Do not invent controls, coordinates, or results.
- Prefer visible evidence before acting.
- Choose a target using a concise accessibility-style description:
  examples: "button named Save", "menu item named File",
  "text field named File name", "document editor".
- The runtime will search for that target using accessibility information.
- If no reliable target can be identified, use stop and explain why.
- Use typeFocused only when the screenshot clearly shows the intended
  input already has focus.
- After important actions, reassess the new screenshot.
- Return done only when the screenshot provides evidence the task is complete.
- Do not claim an action succeeded merely because it was attempted.
- Do not perform destructive or externally consequential actions
  unless the user's task clearly authorizes them.
- Never return keyboard shortcuts or keypress actions.

Return exactly ONE JSON object with one of these schemas:

{"action":"click","target":"button named Save","reason":"The save dialog is visible"}

{"action":"type","target":"text field named File name","text":"example.txt","reason":"The filename field is visible"}

{"action":"typeFocused","text":"Hello world","reason":"The editor visibly has focus"}

{"action":"wait","reason":"The application is transitioning"}

{"action":"done","reason":"The requested result is visibly complete"}

{"action":"stop","reason":"Explain why safe progress is not possible"}
`;
}

async function askModel(
  screenshot: Uint8Array,
  context: AgentContext,
): Promise<AgentAction> {
  const result = await generateText({
    model: google(MODEL),
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: buildPrompt(context) },
          { type: "image", image: screenshot },
        ],
      },
    ],
  });

  console.log("Model response:", result.text);
  return extractJson(result.text);
}

/**
 * Locate a control using the accessibility locator API.
 *
 * This intentionally does not assume a specific application or
 * a particular control name. The target comes from the model.
 *
 * Selector syntax can vary by installed Terminator version. If a
 * target fails, inspect the installed API and actual accessibility tree
 * rather than silently clicking arbitrary coordinates.
 */
async function findTarget(target: string) {
  console.log(`Searching accessibility target: ${target}`);

  const locator = desktop.locator(target);
  const element = await locator.first(3000);

  console.log(`Located target: ${target}`);
  return element;
}

async function executeAction(action: AgentAction): Promise<string> {
  console.log(`Action: ${action.action}`);
  console.log(`Reason: ${action.reason}`);

  switch (action.action) {
    case "click": {
      const element = await findTarget(action.target);
      await element.click();

      return `Clicked ${action.target}.`;
    }

    case "type": {
      const element = await findTarget(action.target);

      await element.typeText(action.text, {
        clearBeforeTyping: false,
        includeWindowScreenshot: false,
      });

      return `Typed text into ${action.target}.`;
    }

    case "typeFocused": {
      // This avoids guessing a screen coordinate, but still relies on
      // the currently focused element being the intended input.
      const focused = await desktop.getCurrentWindow();

      if (!focused) {
        throw new Error(
          "Could not identify the current focused window; refusing to type.",
        );
      }

      throw new Error(
        "typeFocused is not enabled yet: the installed API needs a verified " +
          "focused-element locator before typing can be safely generalized. " +
          "Use a named accessibility target with the type action instead.",
      );
    }

    case "wait":
      // The next iteration captures a fresh screenshot.
      return `Waited for a new observation: ${action.reason}`;

    case "done":
      return `TASK_COMPLETE: ${action.reason}`;

    case "stop":
      return `TASK_STOPPED: ${action.reason}`;
  }
}

async function main(): Promise<void> {
  const task = process.argv.slice(2).join(" ").trim();

  if (!task) {
    console.error(
      'Provide a task, for example: bun run ./index.ts "Open Calculator"',
    );
    process.exitCode = 1;
    return;
  }

  const context: AgentContext = {
    task,
    step: 0,
    previousAction: "No action has been performed.",
    history: [],
  };

  console.log("Starting general desktop agent.");
  console.log(`Model: ${MODEL}`);
  console.log(`Task: ${task}`);

  for (let step = 1; step <= MAX_STEPS; step++) {
    context.step = step;

    console.log(`\n========== STEP ${step}/${MAX_STEPS} ==========`);

    try {
      const screenshot = await captureScreen();
      const action = await askModel(screenshot, context);

      if (action.action === "done") {
        console.log(`SUCCESS: ${action.reason}`);
        return;
      }

      if (action.action === "stop") {
        console.error(`STOPPED: ${action.reason}`);
        return;
      }

      const result = await executeAction(action);

      context.previousAction = result;
      context.history.push(
        `Step ${step}: ${action.action} — ${action.reason} — ${result}`,
      );

      console.log(result);

      if (result.startsWith("TASK_STOPPED:")) {
        return;
      }

      if (result.startsWith("TASK_COMPLETE:")) {
        console.log(result);
        return;
      }
    } catch (error) {
      console.error("Action failed:", error);
      context.previousAction = `Previous action failed: ${
        error instanceof Error ? error.message : String(error)
      }`;

      context.history.push(`Step ${step}: ERROR — ${context.previousAction}`);

      // Do not let the model repeatedly retry a failed selector blindly.
      console.error("Stopping to avoid repeating a failed action.");
      return;
    }
  }

  console.error(
    `Stopped after ${MAX_STEPS} steps without confirmed completion.`,
  );
}

main().catch((error: unknown) => {
  console.error("Fatal error:", error);
  process.exitCode = 1;
});
