import { randomUUID } from "crypto";
import { ParticipantRole } from "./Room";

/**
 * Abstraction over the transport socket. Implemented by the WebSocket
 * infrastructure layer so the domain stays decoupled from `ws`.
 */
export interface SocketSender {
  readonly id: string;
  send(payload: unknown): boolean;
  close(code?: number, reason?: string): void;
  readonly readyState: "OPEN" | "CLOSING" | "CLOSED" | "CONNECTING";
  /** Marks the socket as replaced by a newer connection (skips cleanup). */
  markReplaced(): void;
}

export type PeerStatus = "active" | "reconnecting" | "left";

export interface PeerProps {
  id?: string;
  userId: string;
  name: string;
  socket: SocketSender;
  role?: ParticipantRole;
  clientIp?: string;
  joinedAt?: number;
  lastHeartbeat?: number;
  reconnectKey?: string;
}

export class Peer {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly clientIp?: string;
  readonly role: ParticipantRole;
  readonly joinedAt: number;
  readonly reconnectKey: string;

  private _socket: SocketSender;
  private _status: PeerStatus;
  private _lastHeartbeat: number;

  constructor(props: PeerProps) {
    this.id = props.id ?? randomUUID();
    this.userId = props.userId;
    this.name = props.name;
    this.clientIp = props.clientIp;
    this.role = props.role ?? "PARTICIPANT";
    this.joinedAt = props.joinedAt ?? Date.now();
    this._lastHeartbeat = props.lastHeartbeat ?? Date.now();
    this.reconnectKey = props.reconnectKey ?? `${this.userId}:${this.id}`;
    this._socket = props.socket;
    this._status = "active";
  }

  get socket(): SocketSender {
    return this._socket;
  }

  set socket(next: SocketSender) {
    this._socket = next;
    this._status = "active";
    this.touchHeartbeat();
  }

  get status(): PeerStatus {
    return this._status;
  }

  markReconnecting(): void {
    this._status = "reconnecting";
  }

  markLeft(): void {
    this._status = "left";
  }

  get lastHeartbeat(): number {
    return this._lastHeartbeat;
  }

  touchHeartbeat(now = Date.now()): void {
    this._lastHeartbeat = now;
  }

  rename(name: string): void {
    (this as { name: string }).name = name;
  }

  isStale(heartbeatTimeoutMs: number, now = Date.now()): boolean {
    return now - this._lastHeartbeat > heartbeatTimeoutMs;
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      userId: this.userId,
      name: this.name,
      role: this.role,
      status: this._status,
      joinedAt: this.joinedAt,
    };
  }
}
