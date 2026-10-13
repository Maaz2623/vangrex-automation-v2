import { google } from "@ai-sdk/google";
import { generateText, stepCountIs, tool } from "ai";
import { Desktop } from "@mediar-ai/terminator";
import screenshot from "screenshot-desktop";
import sharp from "sharp";
import { z } from "zod";

const MODEL = "gemini-3.5-flash-lite";
const PROCESS_NAME = "Code";
const MAX_STEPS = 16;
const SCREEN_CHANGE_THRESHOLD = 5;
const SCREEN_POLL_MS = 700;

const desktop = new Desktop();

type ButtonAction = "Install" | "Manage";

interface ScreenSnapshot {
  image: Buffer;
  signature: Buffer;
}

let latestTree = "";
let treeVersion = 0;
let actionCount = 0;
let lastActionDescription = "No actions yet";
let mustInspectAfterAction = false;
let taskFinished = false;
let lastSignature: Buffer | undefined;

function log(message: string): void {
  console.log(`[AGENT] ${message}`);
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

async function captureScreen(): Promise<ScreenSnapshot> {
  const raw = await screenshot({ format: "jpg" });

  const image = await sharp(raw)
    .resize({ width: 1440, withoutEnlargement: true })
    .jpeg({ quality: 75 })
    .toBuffer();

  const signature = await sharp(image)
    .resize({ width: 32, height: 18, fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer();

  return { image, signature };
}

function compareSignatures(
  previous: Buffer | undefined,
  current: Buffer,
): number {
  if (!previous || previous.length !== current.length) {
    return 100;
  }

  let changedPixels = 0;

  for (let i = 0; i < current.length; i++) {
    if (
      Math.abs((previous[i] ?? 0) - (current[i] ?? 0)) > SCREEN_CHANGE_THRESHOLD
    ) {
      changedPixels++;
    }
  }

  return (changedPixels / current.length) * 100;
}

async function waitForScreenToSettle(): Promise<void> {
  const first = await captureScreen();
  let previous = first.signature;

  for (let attempt = 0; attempt < 4; attempt++) {
    await desktop.delay(SCREEN_POLL_MS);

    const current = await captureScreen();
    const change = compareSignatures(previous, current.signature);

    previous = current.signature;

    if (change < 2) {
      break;
    }
  }
}

async function captureUiTree(): Promise<string> {
  // Use the installed Terminator tree-result API so its indices can be
  // passed to clickByIndex. Keep the process scoped to VS Code.
  const result = await desktop.getWindowTreeResult(PROCESS_NAME, undefined, {
    propertyMode: "Complete",
    maxDepth: 40,
    formatOutput: true,
    treeOutputFormat: "CompactYaml",
    includeWindowScreenshot: false,
  } as any);

  const output = result as any;

  const formatted =
    typeof output?.formatted === "string"
      ? output.formatted
      : typeof output?.formattedOutput === "string"
        ? output.formattedOutput
        : typeof output?.tree === "string"
          ? output.tree
          : JSON.stringify(result, null, 2);

  latestTree = formatted;
  treeVersion++;

  log(`UI tree refreshed (version ${treeVersion}).`);

  return latestTree;
}

function hasPublisherTrustDialog(tree: string): boolean {
  const lower = normalize(tree);

  return (
    lower.includes("do you trust the publisher") ||
    lower.includes("trust publisher & install") ||
    lower.includes("trust publisher and install")
  );
}

function isOfficialThunderClientResultLine(line: string): boolean {
  const lower = normalize(line);

  if (
    lower.includes("alternative") ||
    lower.includes("httpcopy") ||
    lower.includes("utiltools")
  ) {
    return false;
  }

  return (
    /\[(listitem|treeitem|text|custom)\]/i.test(line) &&
    /\bthunder client\b/i.test(line)
  );
}

function officialThunderClientAlreadyInstalled(tree: string): boolean {
  const lines = tree.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    if (!isOfficialThunderClientResultLine(lines[i] ?? "")) {
      continue;
    }

    const nearby = lines.slice(i, Math.min(lines.length, i + 18)).join("\n");

    if (
      /\[Button\]\s*Manage\b/i.test(nearby) &&
      !/Thunder Client Alternative/i.test(nearby) &&
      !/utiltools/i.test(nearby)
    ) {
      return true;
    }
  }

  // Some VS Code tree layouts do not place the row label and its button
  // next to each other. In that case, avoid claiming success from a
  // loose "Manage" match; require an explicit result row and button.
  return false;
}

function findIndexLine(index: number, tree: string): number {
  const lines = tree.split(/\r?\n/);
  const prefix = new RegExp(`^\\s*#${index}\\s+\\[`);

  return lines.findIndex((line) => prefix.test(line));
}

function getLineIndent(line: string): number {
  return line.match(/^\s*/)?.[0].length ?? 0;
}

function getTargetContext(index: number, tree: string): string | null {
  const lines = tree.split(/\r?\n/);
  const targetPosition = findIndexLine(index, tree);

  if (targetPosition < 0) {
    return null;
  }

  const targetLine = lines[targetPosition] ?? "";
  const targetIndent = getLineIndent(targetLine);

  let parentStart = targetPosition;

  for (let i = targetPosition - 1; i >= 0; i--) {
    const line = lines[i] ?? "";

    if (!line.trim()) {
      continue;
    }

    if (getLineIndent(line) < targetIndent && /^\s*#\d+\s+\[/.test(line)) {
      parentStart = i;
      break;
    }
  }

  let subtreeEnd = targetPosition + 1;

  for (let i = targetPosition + 1; i < lines.length; i++) {
    const line = lines[i] ?? "";

    if (
      line.trim() &&
      /^\s*#\d+\s+\[/.test(line) &&
      getLineIndent(line) <= targetIndent
    ) {
      subtreeEnd = i;
      break;
    }

    subtreeEnd = i + 1;
  }

  const parentChain = lines.slice(parentStart, targetPosition + 1);
  const descendants = lines.slice(targetPosition, subtreeEnd);

  return [...parentChain, ...descendants].join("\n");
}

function validateOfficialInstallButton(
  index: number,
  expectedButton: ButtonAction,
): { valid: boolean; reason: string } {
  if (!latestTree) {
    return { valid: false, reason: "No current UI tree is available." };
  }

  if (mustInspectAfterAction) {
    return {
      valid: false,
      reason: "A fresh UI tree is required after the previous action.",
    };
  }

  if (hasPublisherTrustDialog(latestTree)) {
    return {
      valid: false,
      reason:
        "A publisher-trust dialog is open. The agent will not approve it automatically.",
    };
  }

  const lines = latestTree.split(/\r?\n/);
  const targetPosition = findIndexLine(index, latestTree);

  if (targetPosition < 0) {
    return {
      valid: false,
      reason: `Index #${index} is not in the latest tree.`,
    };
  }

  const targetLine = lines[targetPosition] ?? "";
  const buttonPattern = new RegExp(
    `\\[Button\\]\\s*${expectedButton}\\s*$`,
    "i",
  );

  if (!buttonPattern.test(targetLine.trim())) {
    return {
      valid: false,
      reason: `Index #${index} is not an exact "${expectedButton}" button.`,
    };
  }

  const context = getTargetContext(index, latestTree);

  if (!context) {
    return {
      valid: false,
      reason: "Could not determine the button's UI context.",
    };
  }

  if (/Thunder Client Alternative|utiltools|httpcopy/i.test(context)) {
    return {
      valid: false,
      reason: "The button belongs to an unrelated extension.",
    };
  }

  if (!/\bThunder Client\b/i.test(context)) {
    return {
      valid: false,
      reason:
        "The button's UI context does not identify the official Thunder Client result.",
    };
  }

  if (
    expectedButton === "Install" &&
    /verified publisher/i.test(context) === false
  ) {
    return {
      valid: false,
      reason:
        "The official extension's verified-publisher context could not be confirmed. Refusing to install.",
    };
  }

  return {
    valid: true,
    reason: `Verified #${index} as the ${expectedButton} button for Thunder Client.`,
  };
}

const tools = {
  inspect_ui_tree: tool({
    description:
      "Refresh the current VS Code accessibility tree. Always use this before selecting an action and again after every action.",
    inputSchema: z.object({}),
    execute: async () => {
      const tree = await captureUiTree();

      if (hasPublisherTrustDialog(tree)) {
        return {
          status: "blocked",
          reason:
            "A publisher-trust dialog is open. Do not click Trust Publisher, Install, or any other dialog button. Stop and report the dialog.",
          tree,
        };
      }

      if (officialThunderClientAlreadyInstalled(tree)) {
        return {
          status: "already_installed",
          reason:
            "The official Thunder Client result appears to have a Manage button. Do not install a similarly named extension.",
          tree,
        };
      }

      return {
        status: "inspected",
        treeVersion,
        tree,
      };
    },
  }),

  click_verified_thunder_client_button: tool({
    description:
      "Click only an exact Install or Manage button whose current accessibility-tree context confirms that it belongs to the official Thunder Client extension. Never use this for publisher trust dialogs.",
    inputSchema: z.object({
      index: z.number().int().nonnegative(),
      expectedButton: z.enum(["Install", "Manage"]),
      reason: z.string().min(1).max(300),
    }),
    execute: async ({ index, expectedButton, reason }) => {
      const validation = validateOfficialInstallButton(index, expectedButton);

      if (!validation.valid) {
        log(`Rejected click: ${validation.reason}`);

        return {
          success: false,
          reason: validation.reason,
        };
      }

      log(validation.reason);
      log(`Action reason: ${reason}`);

      // The index comes from the latest Terminator UI tree. No screen
      // coordinates or global keyboard input are used.
      desktop.clickByIndex(index, "UiTree" as any);

      actionCount++;
      lastActionDescription = `Clicked official Thunder Client ${expectedButton} button (#${index})`;
      mustInspectAfterAction = true;

      await waitForScreenToSettle();

      return {
        success: true,
        action: lastActionDescription,
        message:
          "Action sent. Refresh the screenshot and UI tree before taking another action.",
      };
    },
  }),

  finish_task: tool({
    description:
      "Finish only after the current UI tree verifies that the official Thunder Client extension is installed. Never use this merely because a click was attempted.",
    inputSchema: z.object({
      summary: z.string().min(1).max(300),
    }),
    execute: async ({ summary }) => {
      // Always re-check state rather than trusting the model's assertion.
      const tree = await captureUiTree();

      if (hasPublisherTrustDialog(tree)) {
        return {
          success: false,
          reason:
            "A publisher-trust dialog is still open. The task cannot be marked complete.",
        };
      }

      if (!officialThunderClientAlreadyInstalled(tree)) {
        return {
          success: false,
          reason:
            "The current tree does not verify that the official Thunder Client result has a Manage button. The task cannot be marked complete.",
        };
      }

      taskFinished = true;

      return {
        success: true,
        summary,
        verifiedBy: "Current VS Code accessibility tree",
      };
    },
  }),
};

const systemPrompt = `
You are a careful Windows desktop automation agent operating VS Code.

Goal: verify whether the official, verified-publisher "Thunder Client"
extension is installed. Install it only if the official result is clearly
identified and has an Install button.

Rules:
- You receive a fresh screenshot on each outer iteration.
- The accessibility tree is authoritative for element names, indices,
  buttons, and extension context.
- Call inspect_ui_tree first whenever the tree is missing or stale.
- After any action, inspect the UI tree again before doing anything else.
- Only use click_verified_thunder_client_button for an official Thunder
  Client Install or Manage button.
- Never click a button merely because its index exists.
- Never click "Thunder Client Alternative", REST Client, HttpCopy, or
  anything published by utiltools.
- Never approve a publisher-trust dialog. If one appears, stop and report it.
- If the official Thunder Client result has a Manage button, it is already
  installed. Call finish_task only after the tree verifies that.
- Do not type, press keys, use shortcuts, or click screenshot coordinates.
- Do not claim success just because an action was attempted.
- Use at most one tool call per turn. The program will capture a fresh
  screenshot before the next turn.
- If the tree is ambiguous, stop and explain what could not be verified.
`;

async function runAgent(): Promise<void> {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    throw new Error(
      "Missing GOOGLE_GENERATIVE_AI_API_KEY environment variable.",
    );
  }

  console.log("Starting visual + accessibility desktop agent...");
  console.log(`Task: Verify official Thunder Client installation`);
  console.log(`Model: ${MODEL}`);

  for (let step = 1; step <= MAX_STEPS; step++) {
    if (taskFinished) {
      break;
    }

    console.log(`\n========== STEP ${step}/${MAX_STEPS} ==========`);

    const screen = await captureScreen();
    const changePercent = compareSignatures(lastSignature, screen.signature);

    lastSignature = screen.signature;

    log(`Screenshot captured. Change score: ${changePercent.toFixed(2)}%.`);

    // Each decision gets a fresh screenshot and the most recently
    // observed accessibility tree.
    const userText = `
Task: Verify whether the official Thunder Client extension is installed.

Current UI tree version: ${treeVersion}

Current UI tree:
${latestTree || "(Not inspected yet. Call inspect_ui_tree.)"}

Last action:
${lastActionDescription}

${
  mustInspectAfterAction
    ? "IMPORTANT: An action was just attempted. You MUST call inspect_ui_tree now. Do not click anything yet."
    : "Choose the next safe step using the current screenshot and tree."
}

If the official Thunder Client result has Manage, verify completion.
If a publisher-trust dialog is visible, do not interact with it.
`;

    const beforeActionCount = actionCount;
    const beforeTreeVersion = treeVersion;

    const result = await generateText({
      model: google(MODEL),
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            { type: "image", image: screen.image },
          ],
        },
      ],
      tools,
      stopWhen: stepCountIs(1),
      temperature: 0,
    });

    if (result.text.trim()) {
      console.log(`[MODEL] ${result.text.trim()}`);
    }

    if (taskFinished) {
      break;
    }

    if (mustInspectAfterAction && treeVersion > beforeTreeVersion) {
      mustInspectAfterAction = false;
    }

    if (hasPublisherTrustDialog(latestTree)) {
      console.error(
        "\n[STOP] A publisher-trust dialog is present. No trust action was taken.",
      );
      break;
    }

    if (officialThunderClientAlreadyInstalled(latestTree)) {
      console.log(
        "\n[VERIFIED] The official Thunder Client result appears to be installed (Manage button present).",
      );
      taskFinished = true;
      break;
    }

    if (
      actionCount === beforeActionCount &&
      treeVersion === beforeTreeVersion
    ) {
      console.log(
        "[STOP] The model did not perform a permitted inspection or action. Stopping safely.",
      );
      break;
    }
  }

  console.log("\n========== AGENT RESULT ==========");
  console.log(`Actions executed: ${actionCount}`);
  console.log(`Task finished: ${taskFinished}`);
  console.log(`Last action: ${lastActionDescription}`);

  if (!taskFinished) {
    console.log(
      "The task was not verified as complete. Inspect the current VS Code window before continuing.",
    );
  }
}

runAgent().catch((error: unknown) => {
  console.error("\n[FATAL ERROR]");

  if (error instanceof Error) {
    console.error(error.stack ?? error.message);
  } else {
    console.error(error);
  }

  process.exitCode = 1;
});
