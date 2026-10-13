import { mainAgent } from "./agents/main.agent";

async function main(message: string) {
  const result = await mainAgent.generate({
    prompt: message,
  });

  return result.text;
}

main("Open Notepad")
  .then((message) => {
    console.log(message);
  })
  .catch((error: unknown) => {
    console.error("Error:", error);
    process.exitCode = 1;
  });
