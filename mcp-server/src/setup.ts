import fs from "fs";
import path from "path";
import readline from "readline";

export async function setup() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const question = (q: string) =>
    new Promise<string>((resolve) => rl.question(q, resolve));

  console.log("");
  console.log("ClaudeJam — Setup");
  console.log("─────────────────────────────────────────");
  console.log("Configures Claude Code to use the FigJam");
  console.log("MCP server for live board editing.");
  console.log("");

  const defaultDir = process.cwd();
  const answer = await question(
    `Claude Code project directory\n  [${defaultDir}]: `,
  );
  const projectDir = path.resolve(answer.trim() || defaultDir);
  rl.close();

  if (!fs.existsSync(projectDir)) {
    console.error(`\nDirectory not found: ${projectDir}`);
    process.exit(1);
  }

  // Write .mcp.json (merge with existing)
  const mcpPath = path.join(projectDir, ".mcp.json");
  let mcpConfig: Record<string, unknown> = {};
  if (fs.existsSync(mcpPath)) {
    try {
      mcpConfig = JSON.parse(fs.readFileSync(mcpPath, "utf8"));
    } catch {
      console.error(
        `\nCould not parse existing ${mcpPath} — aborting to avoid overwriting it.`,
      );
      process.exit(1);
    }
  }

  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  const servers = (mcpConfig.mcpServers as Record<string, unknown>) ?? {};
  mcpConfig.mcpServers = {
    ...servers,
    claudejam: {
      command,
      args: ["claudejam", "--stdio"],
    },
  };

  fs.writeFileSync(mcpPath, JSON.stringify(mcpConfig, null, 2) + "\n");
  console.log(`\n  ✓ ${mcpPath}`);

  // Write .claude/settings.local.json (merge with existing)
  const claudeDir = path.join(projectDir, ".claude");
  if (!fs.existsSync(claudeDir)) {
    fs.mkdirSync(claudeDir, { recursive: true });
  }

  const settingsPath = path.join(claudeDir, "settings.local.json");
  let settings: Record<string, unknown> = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    } catch {
      console.error(
        `\nCould not parse existing ${settingsPath} — aborting to avoid overwriting it.`,
      );
      process.exit(1);
    }
  }

  settings.enableAllProjectMcpServers = true;
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
  console.log(`  ✓ ${settingsPath}`);

  console.log("");
  console.log("Setup complete.");
  console.log("");
  console.log("Next steps:");
  console.log(
    "  1. Install the FigJam plugin: https://github.com/ABCreativeDesign/ClaudeJam",
  );
  console.log("  2. Open Claude Code in your project directory");
  console.log("  3. Send any message — the MCP server starts automatically");
  console.log(
    "  4. Open a FigJam file and run the plugin — it connects within 3 seconds",
  );
  console.log("");
}
