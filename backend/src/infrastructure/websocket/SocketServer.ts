import type { Server as HttpServer } from "http";
import { WebSocketServer, type WebSocket } from "ws";
import type { SocketConnection } from "./SocketConnection";
import type { Logger } from "../../application/ports/Logger";
import type { MetricsService } from "../metrics/MetricsService";

export interface SocketServerDeps {
  logger: Logger;
  metrics?: MetricsService;
  permessageDeflate: boolean;
  heartbeatIntervalMs: number;
  maxConnections?: number;
  maxPayloadBytes?: number;
}

export interface RawConnectionContext {
  ws: WebSocket;
  clientIp?: string;
  requestId?: string;
}

/**
 * WebSocket server wrapper: applies permessage-deflate compression, a
 * heartbeat interval, a per-node connection cap (DDoS throttling) and
 * exposes a typed connection handler.
 */
export class SocketServer {
  private readonly wss: WebSocketServer;
  private readonly deps: SocketServerDeps;
  private connectionCount = 0;
  private handler?: (ctx: RawConnectionContext) => void;
  private readonly lastPong = new Map<WebSocket, number>();

  constructor(server: HttpServer, deps: SocketServerDeps) {
    this.deps = deps;

    this.wss = new WebSocketServer({
      server,
      perMessageDeflate: deps.permessageDeflate
        ? { zlibDeflateOptions: { level: 6 }, zlibInflateOptions: { chunkSize: 16 * 1024 } }
        : false,
      maxPayload: deps.maxPayloadBytes ?? 100 * 1024,
      clientTracking: true,
    });

    this.wss.on("connection", (ws: WebSocket, req) => {
      if (deps.maxConnections !== undefined && this.connectionCount >= deps.maxConnections) {
        this.deps.logger.warn({}, "socket.connection-rejected (node at capacity)");
        ws.close(1013, "server at capacity");
        return;
      }
      this.connectionCount += 1;
      this.deps.metrics?.setWsConnections(this.connectionCount);
      this.lastPong.set(ws, Date.now());

      const clientIp = extractClientIp(req.socket.remoteAddress);

      ws.on("pong", () => {
        this.lastPong.set(ws, Date.now());
      });

      ws.on("close", () => {
        this.connectionCount -= 1;
        this.lastPong.delete(ws);
        this.deps.metrics?.setWsConnections(this.connectionCount);
      });

      this.handler?.({ ws, clientIp });
    });

    const heartbeatTimer = setInterval(() => {
      this.pingAll();
    }, deps.heartbeatIntervalMs);
    heartbeatTimer.unref?.();
  }

  private pingAll(): void {
    const timeoutMs = this.deps.heartbeatIntervalMs * 2;
    const now = Date.now();
    const clients = this.wss.clients;
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        const last = this.lastPong.get(client) ?? now;
        if (now - last > timeoutMs) {
          this.deps.logger.warn({}, "socket.heartbeat-timeout (terminating)");
          client.terminate();
          continue;
        }
        try {
          client.ping();
        } catch {
          /* ignore */
        }
      }
    }
  }

  onConnection(handler: (ctx: RawConnectionContext) => void): void {
    this.handler = handler;
  }

  get connections(): number {
    return this.connectionCount;
  }

  async close(): Promise<void> {
    for (const client of this.wss.clients) {
      client.close(1001, "server shutting down");
    }
    await new Promise<void>((resolve) => this.wss.close(() => resolve()));
  }
}

function extractClientIp(remoteAddress?: string | null): string | undefined {
  if (!remoteAddress) return undefined;
  return remoteAddress.replace(/^::ffff:/, "").replace(/^::1$/, "127.0.0.1");
}
