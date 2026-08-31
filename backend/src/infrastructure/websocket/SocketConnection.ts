import { randomUUID } from "crypto";
import type { WebSocket, RawData } from "ws";
import type { SocketSender } from "../../domain/entities/Peer";
import type { Logger } from "../../application/ports/Logger";
import type { MetricsService } from "../metrics/MetricsService";

export interface SocketConnectionDeps {
  logger: Logger;
  metrics?: MetricsService;
  maxMessageSizeBytes?: number;
}

export const WS_READY_STATE = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
} as const;

/**
 * Transport adapter that implements the domain SocketSender port, hiding the
 * underlying `ws` library. Tracks per-connection signaling state (user,
 * room, peer) and enforces message size limits.
 */
export class SocketConnection implements SocketSender {
  readonly id: string;
  readonly clientIp?: string;
  private readonly raw: WebSocket;
  private readonly deps: SocketConnectionDeps;
  private readonly loggerInternal: Logger;

  userId?: string;
  roomId?: string;
  peerId?: string;
  joined = false;
  replaced = false;
  lastActivityAt = Date.now();
  requestId?: string;
  lastPongAt = Date.now();

  constructor(raw: WebSocket, clientIp: string | undefined, deps: SocketConnectionDeps) {
    this.id = randomUUID();
    this.raw = raw;
    this.clientIp = clientIp;
    this.deps = deps;
    this.loggerInternal = deps.logger.child({ connectionId: this.id });
  }

  markReplaced(): void {
    this.replaced = true;
  }

  get logger(): Logger {
    return this.loggerInternal;
  }

  get readyState(): "OPEN" | "CLOSING" | "CLOSED" | "CONNECTING" {
    switch (this.raw.readyState) {
      case WS_READY_STATE.OPEN:
        return "OPEN";
      case WS_READY_STATE.CLOSING:
        return "CLOSING";
      case WS_READY_STATE.CLOSED:
        return "CLOSED";
      default:
        return "CONNECTING";
    }
  }

  get rawSocket(): WebSocket {
    return this.raw;
  }

  get maxMessageSizeBytes(): number {
    return this.deps.maxMessageSizeBytes ?? 100 * 1024;
  }

  /** Sends a JSON payload; returns false if the socket is not open. */
  send(payload: unknown): boolean {
    if (this.readyState !== "OPEN") return false;
    const raw = typeof payload === "string" ? payload : JSON.stringify(payload);
    if (Buffer.byteLength(raw) > this.maxMessageSizeBytes) {
      this.loggerInternal.warn(
        { connectionId: this.id, size: Buffer.byteLength(raw) },
        "socket.outbound-too-large"
      );
      return false;
    }
    try {
      this.raw.send(raw);
      this.lastActivityAt = Date.now();
      return true;
    } catch (err) {
      this.loggerInternal.debug(
        { connectionId: this.id, error: (err as Error).message },
        "socket.send-failed"
      );
      return false;
    }
  }

  close(code?: number, reason?: string): void {
    if (this.readyState !== "OPEN" && this.readyState !== "CONNECTING") return;
    try {
      this.raw.close(code, reason);
    } catch {
      /* already closing */
    }
  }

  terminate(): void {
    try {
      this.raw.terminate();
    } catch {
      /* ignore */
    }
  }

  onMessage(handler: (data: RawData) => void): void {
    this.raw.on("message", handler);
  }

  onClose(handler: (code: number, reason: Buffer) => void): void {
    this.raw.on("close", handler);
  }

  onError(handler: (err: Error) => void): void {
    this.raw.on("error", handler);
  }

  ping(): void {
    if (this.readyState === "OPEN") {
      try {
        this.raw.ping();
      } catch { /* ignore */ }
    }
  }

  touch(): void {
    this.lastActivityAt = Date.now();
  }
}
