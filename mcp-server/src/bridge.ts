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
  timer?: ReturnType<typeof setTimeout>;
}

export interface BridgeOptions {
  /** Sent to each plugin on connect so it can flag version mismatches. */
  version?: string;
  /** How long a command waits for the plugin to connect before failing. */
  connectTimeoutMs?: number;
  /** Runs once the bridge starts listening (e.g. to start the health server). */
  onListen?: () => void;
}

const DEFAULT_CONNECT_TIMEOUT_MS = 10000;

/**
 * Relays commands to the FigJam plugin over a local WebSocket.
 *
 * The bridge stays dormant until the first command: the Claude app launches
 * every configured server at startup, often more than once, so claiming the
 * port eagerly made idle sessions collide with the one actually in use.
 */
export class Bridge {
  private wss: WebSocketServer | null = null;
  private listening: Promise<void> | null = null;
  private ws: WebSocket | null = null;
  private queue: PendingCommand[] = [];
  private pending: Map<string, PendingCommand> = new Map();
  private readonly connectTimeoutMs: number;

  constructor(
    private readonly port: number,
    private readonly options: BridgeOptions = {},
  ) {
    this.connectTimeoutMs =
      options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
  }

  /**
   * Start listening for the plugin. Idempotent; called by the first command.
   * If the port is taken, rejects with a readable message and leaves the
   * bridge free to try again on a later call.
   */
  listen(): Promise<void> {
    if (this.listening) return this.listening;
    this.listening = new Promise<void>((resolve, reject) => {
      const wss = new WebSocketServer({ port: this.port });
      wss.once("listening", () => {
        this.wss = wss;
        // Errors after startup are logged, never thrown (an unhandled
        // 'error' event would crash the process).
        wss.on("error", (err) => console.error("[claudejam] bridge:", err));
        this.options.onListen?.();
        resolve();
      });
      wss.once("error", (err: NodeJS.ErrnoException) => {
        if (this.wss) return; // already listening; handled above
        this.listening = null;
        wss.close();
        reject(
          err.code === "EADDRINUSE"
            ? new Error(
                `Another Claude session is already using ClaudeJam (port ${this.port} is in use). ` +
                  "Finish or close ClaudeJam in that session, then try again.",
              )
            : err,
        );
      });
      wss.on("connection", (ws) => this.onConnection(ws));
    });
    return this.listening;
  }

  private onConnection(ws: WebSocket) {
    this.ws = ws;
    // Introduce ourselves so the plugin can warn when its version and the
    // server's differ. Has no id, so it is never mistaken for a command
    // reply. Plugins older than 1.5.5 ignore it.
    ws.send(
      JSON.stringify({ type: "server-hello", version: this.options.version }),
    );
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
  }

  private flushQueue() {
    while (this.queue.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      const cmd = this.queue.shift()!;
      clearTimeout(cmd.timer);
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

  async execute(
    type: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    await this.listen();
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
        return;
      }
      // The plugin retries every 3s, so if it's open it connects well within
      // the timeout. If it isn't, fail clearly instead of waiting forever.
      cmd.timer = setTimeout(() => {
        const i = this.queue.indexOf(cmd);
        if (i >= 0) this.queue.splice(i, 1);
        reject(
          new Error(
            "The ClaudeJam plugin isn't connected. Open a FigJam file, run the " +
              "ClaudeJam plugin (Plugins → Development → ClaudeJam), then try again.",
          ),
        );
      }, this.connectTimeoutMs);
      this.queue.push(cmd);
    });
  }

  get connected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  close(callback?: () => void) {
    for (const cmd of this.queue) clearTimeout(cmd.timer);
    if (!this.wss) {
      callback?.();
      return;
    }
    // Terminate all active connections so wss.close() can invoke its callback
    for (const client of this.wss.clients) {
      client.terminate();
    }
    this.wss.close(callback);
  }
}
