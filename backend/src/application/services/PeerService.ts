import type { Room } from "../../domain/entities/Room";
import type { Peer } from "../../domain/entities/Peer";
import { EventBus, DomainEventType } from "../../domain/events/EventBus";
import type { RoomService } from "./RoomService";
import type { SessionStorePort } from "../ports/SharedPorts";
import type { Logger } from "../ports/Logger";
import { config } from "../../config/config";

export interface PeerServiceDeps {
  roomService: RoomService;
  eventBus: EventBus;
  sessionStore: SessionStorePort;
  logger: Logger;
  heartbeatTimeoutMs?: number;
  now?: () => number;
}

/**
 * Peer lifecycle service: joins, leaves, reconnection handling, heartbeats
 * and cleanup of stale peers. Emits peer domain events (joined, left,
 * reconnecting).
 */
export class PeerService {
  private readonly heartbeatTimeoutMs: number;
  private readonly now: () => number;
  private readonly sweeps = new Map<string, ReturnType<typeof setInterval>>();

  constructor(private readonly deps: PeerServiceDeps) {
    this.heartbeatTimeoutMs =
      deps.heartbeatTimeoutMs ?? config.env.HEARTBEAT_TIMEOUT_MS;
    this.now = deps.now ?? Date.now;
  }

  /**
   * Adds a peer to a room. Handles the reconnection case where the same
   * userId already has a live peer in the room: the previous socket is
   * closed and its stale peer entry replaced.
   */
  async joinRoom(room: Room, peer: Peer): Promise<{ replacedPeerId?: string }> {
    const existing = room.findPeerByUserId(peer.userId);
    let replacedPeerId: string | undefined;

    if (existing) {
      replacedPeerId = existing.id;
      this.deps.logger.info(
        { roomId: room.id, userId: peer.userId, oldPeerId: existing.id, newPeerId: peer.id },
        "peer.replacing-socket"
      );
      existing.socket.markReplaced();
      existing.socket.close(1000, "replaced by new session");
      room.removePeer(existing.id);

      void this.deps.eventBus.emit({
        type: DomainEventType.PEER_LEFT,
        payload: { room, peer: existing },
      });
    }

    room.addPeer(peer);
    await this.deps.roomService.save(room);

    void this.deps.eventBus.emit({
      type: DomainEventType.PEER_JOINED,
      payload: { room, peer },
    });

    return { replacedPeerId };
  }

  async leaveRoom(room: Room, peerId: string): Promise<Peer | undefined> {
    const peer = room.getPeer(peerId);
    if (!peer) return undefined;

    const removed = room.removePeer(peerId);
    await this.deps.roomService.save(room);

    void this.deps.eventBus.emit({
      type: DomainEventType.PEER_LEFT,
      payload: { room, peer: removed },
    });

    if (room.isEmpty) {
      this.deps.logger.info({ roomId: room.id }, "room.empty");
      void this.deps.eventBus.emit({
        type: DomainEventType.ROOM_EMPTY,
        payload: { room },
      });
      this.deps.roomService.scheduleCleanup(room.id);
    }

    return removed;
  }

  async markReconnecting(room: Room, peerId: string): Promise<void> {
    const peer = room.getPeer(peerId);
    if (!peer) return;
    peer.markReconnecting();
    void this.deps.eventBus.emit({
      type: DomainEventType.PEER_RECONNECTING,
      payload: { room, peer },
    });
  }

  async heartbeat(room: Room, peerId: string): Promise<void> {
    const peer = room.getPeer(peerId);
    if (!peer) return;
    peer.touchHeartbeat(this.now());
  }

  /**
   * Starts a periodic sweep that evicts peers whose heartbeats have timed
   * out. Called once per room when the first peer joins.
   */
  startHeartbeatSweep(roomId: string): void {
    if (this.sweeps.has(roomId)) return;
    const interval = setInterval(() => {
      void this.sweep(roomId);
    }, Math.max(this.heartbeatTimeoutMs / 3, 1000));
    this.sweeps.set(roomId, interval);
  }

  async sweep(roomId: string): Promise<void> {
    const room = await this.deps.roomService.getRoom(roomId);
    if (!room) return;
    const stale = room.activePeers.filter((p) => p.isStale(this.heartbeatTimeoutMs, this.now()));
    for (const peer of stale) {
      this.deps.logger.warn(
        { roomId, peerId: peer.id, userId: peer.userId },
        "peer.heartbeat-timeout"
      );
      peer.socket.close(4001, "heartbeat timeout");
      await this.leaveRoom(room, peer.id);
    }
  }

  stopHeartbeatSweep(roomId: string): void {
    const interval = this.sweeps.get(roomId);
    if (interval) {
      clearInterval(interval);
      this.sweeps.delete(roomId);
    }
  }

  dispose(): void {
    for (const interval of this.sweeps.values()) {
      clearInterval(interval);
    }
    this.sweeps.clear();
  }
}
