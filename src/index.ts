import { mainAgent } from "./agents/main.agent";

async function main(message: string) {
  const result = await mainAgent.generate({
    prompt: message,
  });

  return result.text;
}

main(
  "In vscode open recents and select vangrex automation v2. then git push from the ui.",
)
  .then((message) => {
    console.log(message);
  })
  .catch((error: unknown) => {
    console.error("Error:", error);
    process.exitCode = 1;
  });
