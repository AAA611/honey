import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";

const distRoot = new URL("../dist/", import.meta.url);

await removeTests(distRoot);

async function removeTests(dirUrl) {
  const entries = await readdir(dirUrl, { withFileTypes: true });
  for (const entry of entries) {
    const childUrl = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, dirUrl);
    if (entry.isDirectory()) {
      await removeTests(childUrl);
      continue;
    }

    if (
      entry.name.endsWith(".test.js") ||
      entry.name.endsWith(".test.js.map") ||
      entry.name.endsWith(".test.d.ts")
    ) {
      await rm(childUrl, { force: true });
    }
  }
}
