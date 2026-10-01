import express from "express";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Bridge } from "./bridge.js";
import { registerTools } from "./tools.js";

// Read at runtime rather than importing the JSON: a TS JSON import would pull
// package.json into the compilation, shifting rootDir and emitting dist/src/
// instead of dist/. Path resolves the same locally and when installed, since
// npm ships package.json alongside dist/.
const { version: VERSION } = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"),
    "utf8",
  ),
) as { version: string };

const MCP_PORT = parseInt(process.env.FIGJAM_MCP_PORT || "3055", 10);
const WS_PORT = parseInt(process.env.FIGJAM_WS_PORT || "3766", 10);
const STDIO_MODE = process.argv.includes("--stdio");

const bridge = new Bridge(WS_PORT, VERSION);
const mcpServer = new McpServer({ name: "claudejam", version: VERSION });
registerTools(mcpServer, bridge);

if (STDIO_MODE) {
  // Stdio transport: CC manages this process. All logs must go to stderr.
  const app = express();
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", pluginConnected: bridge.connected });
  });
  const httpServer = app.listen(MCP_PORT, "127.0.0.1", () => {
    console.error("ClaudeJam MCP server running (stdio mode)");
    console.error(`  WebSocket: ws://localhost:${WS_PORT}`);
    console.error(`  Health:    http://localhost:${MCP_PORT}/health`);
  });

  // Graceful shutdown — prevents orphaned processes when CC desktop closes
  let shuttingDown = false;
  async function shutdown(reason: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    console.error(`[claudejam] shutdown: ${reason}`);
    await Promise.all([
      new Promise<void>((resolve) => bridge.close(() => resolve())),
      new Promise<void>((resolve) => httpServer.close(() => resolve())),
    ]);
    process.exit(0);
  }

  // Trigger 1: stdin EOF — canonical "parent dropped me" signal in stdio MCP
  process.stdin.on("end", () => shutdown("stdin EOF"));
  process.stdin.on("close", () => shutdown("stdin close"));

  // Trigger 2: explicit kill signals from CC, OS, or terminal close
  (["SIGTERM", "SIGINT", "SIGHUP"] as const).forEach((sig) =>
    process.on(sig, () => shutdown(sig)),
  );

  // Trigger 3: Windows belt-and-suspenders
  if (process.platform === "win32") {
    process.on("SIGBREAK", () => shutdown("SIGBREAK"));
  }

  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
} else {
  // HTTP/SSE mode: manual startup for development or CLI use.
  const app = express();
  app.use(express.json());

  const transports = new Map<string, SSEServerTransport>();

  app.get("/sse", async (req, res) => {
    try {
      const transport = new SSEServerTransport("/message", res);
      transports.set(transport.sessionId, transport);
      await mcpServer.connect(transport);
      req.on("close", () => transports.delete(transport.sessionId));
    } catch (err) {
      console.error("SSE connection failed:", err);
      if (!res.headersSent) res.status(500).end();
    }
  });

  app.post("/message", async (req, res) => {
    const sessionId = req.query.sessionId as string;
    const transport = transports.get(sessionId);
    if (!transport) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    try {
      await transport.handlePostMessage(req, res);
    } catch (err) {
      console.error("Message handling failed:", err);
      if (!res.headersSent) res.status(500).end();
    }
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", pluginConnected: bridge.connected });
  });

  app.listen(MCP_PORT, "127.0.0.1", () => {
    console.log("ClaudeJam MCP server running");
    console.log(`  MCP (SSE):  http://localhost:${MCP_PORT}/sse`);
    console.log(`  WebSocket:  ws://localhost:${WS_PORT}`);
    console.log(`  Health:     http://localhost:${MCP_PORT}/health`);
  });
}
