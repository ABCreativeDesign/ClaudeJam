// claude-figjam/mcp-server/tests/bridge.test.ts
import { Bridge } from "../src/bridge.js";
import WebSocket from "ws";

describe("Bridge", () => {
  let bridge: Bridge;
  let mockClient: WebSocket;

  beforeEach((done) => {
    bridge = new Bridge(3099);
    mockClient = new WebSocket("ws://localhost:3099");
    mockClient.on("open", done);
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

  test("execute sends command to plugin and resolves with result", (done) => {
    mockClient.on("message", (data) => {
      const cmd = JSON.parse(data.toString());
      mockClient.send(JSON.stringify({ id: cmd.id, result: { nodes: [] } }));
    });

    bridge.execute("read_board", {}).then((result) => {
      expect(result).toEqual({ nodes: [] });
      done();
    });
  });

  test("execute rejects when plugin returns an error", (done) => {
    mockClient.on("message", (data) => {
      const cmd = JSON.parse(data.toString());
      mockClient.send(JSON.stringify({ id: cmd.id, error: "Node not found" }));
    });

    bridge.execute("update_node", { node_id: "bad-id" }).catch((err: Error) => {
      expect(err.message).toBe("Node not found");
      done();
    });
  });

  test("queues commands when disconnected and delivers on reconnect", (done) => {
    const freshBridge = new Bridge(3098);

    freshBridge.execute("read_board", {}).then((result) => {
      expect(result).toEqual({ nodes: [] });
      freshBridge.close(done);
    });

    const lateClient = new WebSocket("ws://localhost:3098");
    lateClient.on("open", () => {
      lateClient.on("message", (data) => {
        const cmd = JSON.parse(data.toString());
        lateClient.send(JSON.stringify({ id: cmd.id, result: { nodes: [] } }));
      });
    });
  });
});
