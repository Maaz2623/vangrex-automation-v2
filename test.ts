import { Desktop } from "@mediar-ai/terminator";
import * as Terminator from "@mediar-ai/terminator";

const desktop = new Desktop();

const notepad = await desktop.getCurrentApplication();

const tree = await desktop.getWindowTreeResult(
  notepad.processName(),
  undefined,
  {
    formatOutput: true,
    propertyMode: Terminator.PropertyLoadingMode.Complete,
    treeOutputFormat: Terminator.TreeOutputFormat.CompactYaml,
  },
);

const element = await notepad
  .locator(`role:Button|name:Toggle Chat`)
  .first(2000);

const clicked = await element.click({
  uiDiffBeforeAfter: true,
});

console.log(clicked.uiDiff?.diff);

const secondClick = await element.click({
  uiDiffBeforeAfter: true,
});

console.log(secondClick.uiDiff?.diff);
