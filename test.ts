import { Desktop } from "@mediar-ai/terminator";
import * as Terminator from "@mediar-ai/terminator";

async function main() {
  const desktop = new Desktop();
  const currentWindow = await desktop.getCurrentApplication();

  const tree = await desktop.getWindowTreeResult(
    currentWindow.processName(),
    undefined,
    {
      formatOutput: true,
      treeOutputFormat: Terminator.TreeOutputFormat.CompactYaml,
      propertyMode: Terminator.PropertyLoadingMode.Complete,
    },
  );

  console.log(tree.formatted);
}

main().catch((error: unknown) => {
  console.error("Application search failed:", error);
  process.exitCode = 1;
});
