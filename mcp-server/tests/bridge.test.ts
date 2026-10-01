// claude-figjam/mcp-server/tests/bridge.test.ts
import { Bridge } from "../src/bridge.js";
import WebSocket from "ws";
import net from "node:net";

// Answers every command with { nodes: [] }, ignoring the server-hello.
function autoReply(client: WebSocket) {
  client.on("message", (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.type === "server-hello") return;
    client.send(JSON.stringify({ id: msg.id, result: { nodes: [] } }));
  });
}

describe("Bridge", () => {
  let bridge: Bridge;
  let mockClient: WebSocket;

  beforeEach(async () => {
    bridge = new Bridge(3099);
    await bridge.listen();
    mockClient = new WebSocket("ws://localhost:3099");
    await new Promise((resolve) => mockClient.on("open", resolve));
  });

  afterEach((done) => {
    mockClient.close();
    bridge.close(done);
  });

  test("reports connected when plugin is open", () => {
    expect(bridge.connected).toBe(true);
  });

  test("reports disconnected after plugin closes", (done) => {
    mockClient.close();
    setTimeout(() => {
      expect(bridge.connected).toBe(false);
      done();
    }, 50);
  });

  test("execute sends command to plugin and resolves with result", async () => {
    autoReply(mockClient);
    await expect(bridge.execute("read_board", {})).resolves.toEqual({
      nodes: [],
    });
  });

  test("execute rejects when plugin returns an error", async () => {
    mockClient.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "server-hello") return;
      mockClient.send(JSON.stringify({ id: msg.id, error: "Node not found" }));
    });
    await expect(
      bridge.execute("update_node", { node_id: "bad-id" }),
    ).rejects.toThrow("Node not found");
  });
});

describe("Bridge lifecycle", () => {
  test("opens no port until the first command", async () => {
    const idle = new Bridge(3096);
    const refused = await new Promise<boolean>((resolve) => {
      const probe = new WebSocket("ws://localhost:3096");
      probe.on("open", () => {
        probe.close();
        resolve(false);
      });
      probe.on("error", () => resolve(true));
    });
    expect(refused).toBe(true);
    await new Promise<void>((resolve) => idle.close(resolve));
  });

  test("first command starts listening and is delivered once the plugin connects", async () => {
    const lazy = new Bridge(3098);
    const result = lazy.execute("read_board", {});
    await lazy.listen(); // same start the command triggered
    const late = new WebSocket("ws://localhost:3098");
    autoReply(late);
    await expect(result).resolves.toEqual({ nodes: [] });
    late.close();
    await new Promise<void>((resolve) => lazy.close(resolve));
  });

  test("greets each plugin with the server version on connect", async () => {
    const versioned = new Bridge(3097, { version: "9.9.9" });
    await versioned.listen();
    const client = new WebSocket("ws://localhost:3097");
    const hello = await new Promise((resolve) =>
      client.once("message", (data) => resolve(JSON.parse(data.toString()))),
    );
    expect(hello).toEqual({ type: "server-hello", version: "9.9.9" });
    client.close();
    await new Promise<void>((resolve) => versioned.close(resolve));
  });

  test("port already in use: command fails with a clear message, no crash, and a later call can still start", async () => {
    const blocker = net.createServer();
    await new Promise<void>((resolve) => blocker.listen(3095, resolve));

    const contested = new Bridge(3095, { connectTimeoutMs: 200 });
    await expect(contested.execute("read_board", {})).rejects.toThrow(
      /Another Claude session is already using ClaudeJam/,
    );

    await new Promise<void>((resolve) => blocker.close(() => resolve()));
    await expect(contested.listen()).resolves.toBeUndefined();
    await new Promise<void>((resolve) => contested.close(resolve));
  });

  test("plugin never connects: command fails with a clear message after the timeout", async () => {
    const lonely = new Bridge(3094, { connectTimeoutMs: 200 });
    await expect(lonely.execute("read_board", {})).rejects.toThrow(
      /ClaudeJam plugin isn't connected/,
    );
    await new Promise<void>((resolve) => lonely.close(resolve));
  });
});
