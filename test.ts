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

console.log(tree.formatted);
