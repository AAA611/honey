#!/usr/bin/env node
/**
 * HITL key capture for Cursor/VS Code integrated terminal.
 *
 *   node scripts/capture-esc-key.mjs
 *
 * Focus this terminal, press Esc (and optionally arrows / Ctrl+G), then Ctrl+C.
 * Prints each stdin chunk as JSON + hex so we can see what Esc actually delivers.
 */
import process from "node:process";

if (!process.stdin.isTTY) {
  console.error("Need a TTY. Run this inside Cursor's integrated terminal.");
  process.exit(1);
}

process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.setEncoding("utf8");

console.log("Raw capture armed. Press Esc / arrows / Ctrl+G. Ctrl+C to quit.\n");

process.stdin.on("data", (chunk) => {
  const text = typeof chunk === "string" ? chunk : String(chunk);
  if (text === "\u0003") {
    console.log("\n^C — bye");
    process.stdin.setRawMode(false);
    process.exit(0);
  }
  const hex = [...text]
    .map((ch) => ch.charCodeAt(0).toString(16).padStart(2, "0"))
    .join(" ");
  console.log(
    JSON.stringify({
      length: text.length,
      hex,
      json: text,
      codes: [...text].map((ch) => ch.charCodeAt(0))
    })
  );
});
