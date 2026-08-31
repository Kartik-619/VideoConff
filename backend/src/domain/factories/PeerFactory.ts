import { Peer, SocketSender } from "../entities/Peer";
import type { ParticipantRole } from "../entities/Room";

export interface PeerFactoryDeps {
  now?: () => number;
  nextId?: () => string;
}

/**
 * Factory for Peer entities. Centralizes peer construction so the
 * application layer never calls `new Peer(...)` directly.
 */
export class PeerFactory {
  private readonly now: () => number;
  private readonly nextId: () => string;

  constructor(deps: PeerFactoryDeps = {}) {
    this.now = deps.now ?? Date.now;
    this.nextId = deps.nextId ?? (() => crypto.randomUUID());
  }

  create(params: {
    userId: string;
    name: string;
    socket: SocketSender;
    role?: ParticipantRole;
    clientIp?: string;
    reconnectKey?: string;
  }): Peer {
    return new Peer({
      id: this.nextId(),
      userId: params.userId,
      name: params.name,
      socket: params.socket,
      role: params.role,
      clientIp: params.clientIp,
      joinedAt: this.now(),
      lastHeartbeat: this.now(),
      reconnectKey: params.reconnectKey,
    });
  }
}
