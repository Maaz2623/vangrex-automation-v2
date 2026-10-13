import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { Desktop } from "@mediar-ai/terminator";
import * as Terminator from "@mediar-ai/terminator";

const desktop = new Desktop();

const MODEL = "gemini-3.5-flash-lite";
const MAX_STEPS = 14;

const DOCUMENT_TEXT =
  "Hello! This document was created by my Gemini Vision desktop automation agent.";

const FILE_NAME = "vision-agent-test.txt";

type VisionAction =
  | { action: "click"; x: number; y: number; reason: string }
  | { action: "typeContent"; reason: string }
  | { action: "typeFilename"; reason: string }
  | { action: "done"; reason: string }
  | { action: "stop"; reason: string };

type Stage = "write" | "open-save" | "filename" | "save" | "verify";

function parseAction(text: string): VisionAction {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const start = cleaned.indexOf("{");

  if (start < 0) {
    throw new Error(`Gemini returned no JSON: ${text}`);
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  let end = -1;

  for (let i = start; i < cleaned.length; i++) {
    const char = cleaned[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') inString = true;
    else if (char === "{") depth++;
    else if (char === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  if (end < 0) {
    throw new Error(`Gemini returned incomplete JSON: ${text}`);
  }

  const value: unknown = JSON.parse(cleaned.slice(start, end + 1));

  if (typeof value !== "object" || value === null) {
    throw new Error("Expected a JSON object.");
  }

  const item = value as Record<string, unknown>;

  if (typeof item.reason !== "string") {
    throw new Error("Missing action reason.");
  }

  if (item.action === "click") {
    if (
      typeof item.x !== "number" ||
      typeof item.y !== "number" ||
      !Number.isFinite(item.x) ||
      !Number.isFinite(item.y)
    ) {
      throw new Error("Invalid click coordinates.");
    }

    return {
      action: "click",
      x: item.x,
      y: item.y,
      reason: item.reason,
    };
  }

  if (
    item.action === "typeContent" ||
    item.action === "typeFilename" ||
    item.action === "done" ||
    item.action === "stop"
  ) {
    return {
      action: item.action,
      reason: item.reason,
    } as VisionAction;
  }

  throw new Error(`Unknown action: ${String(item.action)}`);
}

async function captureScreen(): Promise<Uint8Array> {
  const monitor = await desktop.getPrimaryMonitor();
  const screenshot = await desktop.captureMonitor(monitor);

  return new Uint8Array(desktop.screenshotToPng(screenshot));
}

async function askGemini(
  screenshot: Uint8Array,
  step: number,
  stage: Stage,
  lastAction: string,
): Promise<VisionAction> {
  const instructions = {
    write: `
STAGE: WRITE DOCUMENT CONTENT.
Find the already-open Notepad window and its text editing area.
If Notepad is not visible, click its visible window/taskbar entry.
When the Notepad editing area is visible, return:
{"action":"typeContent","reason":"The Notepad editor is visible"}
Do not use the filename field or another application's editor.
`,
    "open-save": `
STAGE: OPEN SAVE DIALOG.
The document content has been entered.
Use visible mouse clicks only.
Click Notepad's File menu, then choose Save or Save As.
Inspect the screenshot after each click.
Do not use keyboard shortcuts.
`,
    filename: `
STAGE: ENTER FILENAME.
The Notepad Save dialog should be visible.
Click its File name field if needed.
When that field is visibly focused, return:
{"action":"typeFilename","reason":"The Save dialog filename field is focused"}
`,
    save: `
STAGE: SAVE DOCUMENT.
The filename has been entered.
Inspect the Save dialog and click its visible Save button.
Do not click unrelated buttons.
`,
    verify: `
STAGE: VERIFY SAVE.
Inspect the screen for evidence that the Save dialog closed
and the Notepad document is open with the expected filename.
If it is visibly saved, return:
{"action":"done","reason":"The saved Notepad document is visible"}
If not, choose the next safe visible click or stop.
`,
  }[stage];

  const result = await generateText({
    model: google(MODEL),
    temperature: 0,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `
You are a Windows desktop automation agent.
Your task is to write text in Notepad and save the document.

Step ${step}/${MAX_STEPS}.
Current stage: ${stage}.
Previous action: ${lastAction}

${instructions}

Allowed actions:
{"action":"click","x":400,"y":300,"reason":"Visible target"}
{"action":"typeContent","reason":"Notepad editor is visible"}
{"action":"typeFilename","reason":"Filename field is focused"}
{"action":"done","reason":"Task visibly completed"}
{"action":"stop","reason":"Cannot safely continue"}

Rules:
- Coordinates are absolute screenshot pixel coordinates from top-left.
- The attached image is the full primary-monitor screenshot.
- Use clicks only. Never request key presses or keyboard shortcuts.
- Do not repeat a click when the screenshot has not changed.
- Never claim the document is saved unless there is visible evidence.
- Return only one valid JSON object.
`,
          },
          {
            type: "file",
            data: screenshot,
            mediaType: "image/png",
          },
        ],
      },
    ],
  });

  console.log("\nGemini response:", result.text);
  return parseAction(result.text);
}

async function typeIntoNotepad(selector: string, text: string): Promise<void> {
  // Scope the lookup to Notepad, not the entire desktop.
  const locator = desktop.locatorForProcess("Notepad", selector);
  const element = await locator.first(2000);

  if (!element) {
    throw new Error(`Could not find Notepad element for selector: ${selector}`);
  }

  await element.typeText(text, {
    clearBeforeTyping: false,
    includeWindowScreenshot: false,
  });
}

async function executeAction(action: VisionAction): Promise<void> {
  console.log("Action:", action);

  switch (action.action) {
    case "click":
      desktop.clickAtBounds(
        Math.round(action.x),
        Math.round(action.y),
        2,
        2,
        50,
        50,
        Terminator.ClickType.Left,
      );
      return;

    case "typeContent":
      await typeIntoNotepad("role:Document", DOCUMENT_TEXT);
      console.log("Document content entered.");
      return;

    case "typeFilename":
      await typeIntoNotepad("role:Edit", FILE_NAME);
      console.log(`Filename entered: ${FILE_NAME}`);
      return;

    case "done":
    case "stop":
      return;
  }
}

async function main(): Promise<void> {
  console.log("Starting Gemini Vision Notepad test.");
  console.log(`Model: ${MODEL}`);
  console.log(`Document: ${FILE_NAME}`);

  let stage: Stage = "write";
  let lastAction = "No actions taken.";
  let previousClick: { x: number; y: number } | null = null;
  let repeatedClicks = 0;
  let contentEntered = false;
  let filenameEntered = false;

  for (let step = 1; step <= MAX_STEPS; step++) {
    console.log(`\n========== STEP ${step}/${MAX_STEPS} ==========`);
    console.log("Stage:", stage);

    const screenshot = await captureScreen();
    const action = await askGemini(screenshot, step, stage, lastAction);

    if (action.action === "stop") {
      console.log("STOPPED:", action.reason);
      return;
    }

    if (action.action === "done") {
      if (stage !== "verify") {
        console.log(
          "Rejected completion: the save operation has not been verified.",
        );
        lastAction = "Completion rejected; continue the current stage.";
        continue;
      }

      console.log("SUCCESS:", action.reason);
      return;
    }

    if (action.action === "click") {
      const sameClick =
        previousClick !== null &&
        Math.abs(action.x - previousClick.x) < 15 &&
        Math.abs(action.y - previousClick.y) < 15;

      repeatedClicks = sameClick ? repeatedClicks + 1 : 0;
      previousClick = { x: action.x, y: action.y };

      if (repeatedClicks >= 2) {
        console.log(
          "STOPPED: repeated clicks at nearly identical coordinates.",
        );
        return;
      }

      if (action.x < 0 || action.y < 0) {
        throw new Error("Gemini returned negative screen coordinates.");
      }
    } else {
      previousClick = null;
      repeatedClicks = 0;

      if (action.action === "typeContent") {
        if (stage !== "write" || contentEntered) {
          throw new Error("Content entry is not allowed at this stage.");
        }

        await executeAction(action);
        contentEntered = true;
        stage = "open-save";
        lastAction = "Entered the document content in Notepad.";
        await desktop.delay(700);
        continue;
      }

      if (action.action === "typeFilename") {
        if (stage !== "filename" || filenameEntered) {
          throw new Error("Filename entry is not allowed at this stage.");
        }

        await executeAction(action);
        filenameEntered = true;
        stage = "save";
        lastAction = `Entered filename ${FILE_NAME}.`;
        await desktop.delay(700);
        continue;
      }
    }

    await executeAction(action);
    await desktop.delay(900);

    if (stage === "open-save" && action.action === "click") {
      lastAction =
        "Clicked a visible Notepad menu item. Inspect the Save dialog.";

      // Keep this stage until Gemini asks to enter the filename.
      if (action.reason.toLowerCase().includes("save")) {
        stage = "filename";
      }
    } else if (stage === "filename" && action.action === "click") {
      lastAction = "Clicked the visible filename field.";
    } else if (stage === "save" && action.action === "click") {
      lastAction = "Clicked a visible Save dialog target.";
      stage = "verify";
    } else if (stage === "verify" && action.action === "click") {
      lastAction = "Clicked while checking the saved document.";
    } else if (stage === "write" && action.action === "click") {
      lastAction = "Clicked a visible target to reach Notepad's editor.";
    }
  }

  console.log(`Stopped after reaching ${MAX_STEPS} steps.`);
}

main().catch((error: unknown) => {
  console.error("Agent failed:", error);
  process.exitCode = 1;
});
