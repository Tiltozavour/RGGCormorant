import { readFile } from "node:fs/promises";

const files = [
  "src/components/starterCards.json",
  "src/components/gameConstants.ts",
  "src/components/GameBoard.tsx",
  "src/components/PlayersSidebar.tsx",
];

const externalUrlPattern = /https?:\/\/[^\s"')]+/g;
const violations = [];

for (const file of files) {
  const text = await readFile(file, "utf8");
  const matches = text.match(externalUrlPattern) ?? [];

  for (const url of matches) {
    violations.push(`${file}: ${url}`);
  }
}

if (violations.length > 0) {
  console.error("External card/avatar asset URLs are not allowed:");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log("No external card/avatar asset URLs found.");
