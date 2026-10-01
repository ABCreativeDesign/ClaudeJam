// claudejam/mcp-server/src/bridge.ts
import WebSocket, { WebSocketServer } from "ws";
import { randomUUID } from "node:crypto";
import type { PluginCommand, PluginResponse } from "./types.js";

interface PendingCommand {
  id: string;
  type: string;
  params: Record<string, unknown>;
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
}

export class Bridge {
  private wss: WebSocketServer;
  private ws: WebSocket | null = null;
  private queue: PendingCommand[] = [];
  private pending: Map<string, PendingCommand> = new Map();

  constructor(port: number, version?: string) {
    this.wss = new WebSocketServer({ port });
    this.wss.on("connection", (ws) => {
      this.ws = ws;
      // Introduce ourselves so the plugin can warn when its version and the
      // server's differ. Has no id, so it is never mistaken for a command
      // reply. Plugins older than 1.5.5 ignore it.
      ws.send(JSON.stringify({ type: "server-hello", version }));
      setTimeout(() => this.flushQueue(), 0);

      // Keep the connection alive while Claude thinks between tool calls
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        }
      }, 20000); // ping every 20 seconds

      ws.on("message", (data) => {
        let msg: PluginResponse;
        try {
          msg = JSON.parse(data.toString());
        } catch {
          return; // ignore malformed messages
        }
        const cmd = this.pending.get(msg.id);
        if (!cmd) return;
        this.pending.delete(msg.id);
        if (msg.error) cmd.reject(new Error(msg.error));
        else cmd.resolve(msg.result);
      });

      ws.on("close", () => {
        clearInterval(pingInterval);
        this.ws = null;
        for (const cmd of this.pending.values()) {
          cmd.reject(new Error("Plugin disconnected"));
        }
        this.pending.clear();
      });
    });
  }

  private flushQueue() {
    while (this.queue.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      const cmd = this.queue.shift()!;
      this.dispatch(cmd);
    }
  }

  private dispatch(cmd: PendingCommand) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      cmd.reject(new Error("No active connection"));
      return;
    }
    this.pending.set(cmd.id, cmd);
    const msg: PluginCommand = {
      id: cmd.id,
      type: cmd.type as PluginCommand["type"],
      params: cmd.params,
    };
    this.ws.send(JSON.stringify(msg));
  }

  execute(type: string, params: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const cmd: PendingCommand = {
        id: randomUUID(),
        type,
        params,
        resolve,
        reject,
      };
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.dispatch(cmd);
      } else {
        this.queue.push(cmd);
      }
    });
  }

  get connected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  close(callback?: () => void) {
    // Terminate all active connections so wss.close() can invoke its callback
    for (const client of this.wss.clients) {
      client.terminate();
    }
    this.wss.close(callback);
  }
}
