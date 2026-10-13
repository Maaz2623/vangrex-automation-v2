import { Desktop } from "@mediar-ai/terminator";
import * as Terminator from "@mediar-ai/terminator";

const desktop = new Desktop();

const applicationName = process.argv.slice(2).join(" ") || "Notepad";

async function main() {
  console.log(`Searching for: ${applicationName}`);

  // 1. Open Windows Search.
  await desktop.pressKey("Win");

  // 2. Find the Search box.
  console.log("Finding Search box...");

  const searchLocator = desktop.locator("role:Text|name:Search");
  const searchBox = await searchLocator.first(5000);

  // 3. Enter the application name.
  console.log("Typing application name...");

  await searchBox.typeText(applicationName, {
    clearBeforeTyping: true,
  });

  // 4. Wait for Windows Search results to update.
  await new Promise((resolve) => setTimeout(resolve, 1500));

  // 5. Find the Search window.
  console.log("Reading Search results...");

  const searchWindowLocator = desktop.locator("role:Window|name:Search");

  const searchWindow = await searchWindowLocator.first(5000);

  // 6. Retrieve the accessibility tree.
  const tree = await desktop.getWindowTreeResult(
    searchWindow.processName(),
    undefined,
    {
      propertyMode: Terminator.PropertyLoadingMode.Smart,
      formatOutput: true,
      treeOutputFormat: Terminator.TreeOutputFormat.CompactYaml,
    },
  );

  const formattedTree = tree.formatted;

  console.log("\n--- Windows Search Tree ---\n");
  console.log(formattedTree);

  // 7. Check whether the requested application appears
  //    as an App result, not merely a Web search result.
  const escapeRegExp = (value: string) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const escapedName = escapeRegExp(applicationName);

  const appResultPattern = new RegExp(
    `\\[ListItem\\]\\s+${escapedName}\\s*,\\s*App\\b`,
    "i",
  );

  if (!appResultPattern.test(formattedTree as string)) {
    console.log(
      `\n${applicationName} was not found as an installed-app result.`,
    );
    return;
  }

  console.log(`\nFound an App result for "${applicationName}".`);

  // 8. Locate the Open button only after confirming an App result.
  const openButtonLocator = desktop.locator("role:Button|name:Open");

  try {
    const openButton = await openButtonLocator.first(3000);

    console.log("Clicking Open...");
    await openButton.click();

    console.log(`Open action performed for ${applicationName}.`);
  } catch (error) {
    console.error(
      `Found the app result, but could not click Open for ${applicationName}.`,
      error,
    );
  }
}

main().catch((error: unknown) => {
  console.error("Application search failed:", error);
  process.exitCode = 1;
});
