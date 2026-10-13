import { mainAgent } from "./agents/main.agent";

async function main(message: string) {
  const result = await mainAgent.generate({
    prompt: message,
  });

  return result.text;
}

main("Create a panchatantra-example.txt with 10 lines of story inside it. with a heading in BOLD")
  .then((message) => {
    console.log(message);
  })
  .catch((error: unknown) => {
    console.error("Error:", error);
    process.exitCode = 1;
  });
