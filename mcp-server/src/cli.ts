#!/usr/bin/env node

const args = process.argv.slice(2);

if (args.includes("--stdio")) {
  // Claude Code is starting the MCP server — run it
  await import("./index.js");
} else if (args[0] === "setup") {
  const { setup } = await import("./setup.js");
  await setup();
} else {
  console.log("");
  console.log("ClaudeJam MCP Server");
  console.log("");
  console.log("Usage:");
  console.log("  npx claudejam setup     Configure Claude Code for FigJam");
  console.log(
    "  npx claudejam --stdio   Start the MCP server (used by Claude Code)",
  );
  console.log("");
}
