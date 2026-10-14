import { Desktop } from "@mediar-ai/terminator";
import * as Terminator from "@mediar-ai/terminator";
const desktop = new Desktop();

await desktop.pressKey("Win");

const searchLocator = desktop.locator("role:Text|name:Search");
const searchBox = await searchLocator.first(5000);

await searchBox.typeText("Chrome", {
  clearBeforeTyping: true,
});

await new Promise((resolve) => setTimeout(resolve, 1500));

const searchWindowLocator = desktop.locator("role:Window|name:Search");
const searchWindow = await searchWindowLocator.first(5000);

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

console.log(formattedTree);
