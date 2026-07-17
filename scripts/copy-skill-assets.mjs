import { cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "src", "skills", "bundled");
const to = join(root, "dist", "skills", "bundled");

await mkdir(dirname(to), { recursive: true });
await cp(from, to, { recursive: true });
