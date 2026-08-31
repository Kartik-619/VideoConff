import type { Peer } from "../entities/Peer";
import type { Room } from "../entities/Room";
import type { ChatMessage } from "../entities/ChatMessage";

export const DomainEventType = {
  ROOM_CREATED: "room.created",
  ROOM_DELETED: "room.deleted",
  ROOM_EMPTY: "room.empty",
  ROOM_STARTED: "room.started",
  ROOM_ENDED: "room.ended",
  PEER_JOINED: "peer.joined",
  PEER_LEFT: "peer.left",
  PEER_RECONNECTING: "peer.reconnecting",
  CHAT_MESSAGE: "chat.message",
  MEETING_ENDED: "meeting.ended",
  MEETING_STARTED: "meeting.started",
} as const;

export type DomainEventType = (typeof DomainEventType)[keyof typeof DomainEventType];

export interface RoomEventPayload {
  room: Room;
}

export interface PeerEventPayload {
  room: Room;
  peer: Peer;
}

export interface ChatEventPayload {
  room: Room;
  message: ChatMessage;
}

export type DomainEvent =
  | { type: typeof DomainEventType.ROOM_CREATED; payload: RoomEventPayload }
  | { type: typeof DomainEventType.ROOM_DELETED; payload: RoomEventPayload }
  | { type: typeof DomainEventType.ROOM_EMPTY; payload: RoomEventPayload }
  | { type: typeof DomainEventType.ROOM_STARTED; payload: RoomEventPayload }
  | { type: typeof DomainEventType.ROOM_ENDED; payload: RoomEventPayload }
  | { type: typeof DomainEventType.PEER_JOINED; payload: PeerEventPayload }
  | { type: typeof DomainEventType.PEER_LEFT; payload: PeerEventPayload }
  | { type: typeof DomainEventType.PEER_RECONNECTING; payload: PeerEventPayload }
  | { type: typeof DomainEventType.CHAT_MESSAGE; payload: ChatEventPayload }
  | { type: typeof DomainEventType.MEETING_ENDED; payload: RoomEventPayload }
  | { type: typeof DomainEventType.MEETING_STARTED; payload: RoomEventPayload };

export type DomainEventHandler = (event: DomainEvent) => void | Promise<void>;

/**
 * Lightweight in-process event bus (Observer pattern).
 * Distributes domain events to subscribers. Subscribers are notified
 * asynchronously so a failing observer cannot break the publisher.
 */
export class EventBus {
  private readonly handlers = new Map<DomainEventType, Set<DomainEventHandler>>();
  private readonly wildcard = new Set<DomainEventHandler>();

  subscribe(type: DomainEventType, handler: DomainEventHandler): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler);
    return () => set.delete(handler);
  }

  subscribeAll(handler: DomainEventHandler): () => void {
    this.wildcard.add(handler);
    return () => this.wildcard.delete(handler);
  }

  async emit(event: DomainEvent): Promise<void> {
    const handlers = this.handlers.get(event.type);
    const tasks: Promise<void>[] = [];

    if (handlers) {
      for (const handler of handlers) {
        tasks.push(Promise.resolve().then(() => handler(event)));
      }
    }
    for (const handler of this.wildcard) {
      tasks.push(Promise.resolve().then(() => handler(event)));
    }

    if (tasks.length === 0) return;
    const results = await Promise.allSettled(tasks);
    for (const result of results) {
      if (result.status === "rejected") {
        console.error(`[event-bus] handler failed for ${event.type}:`, result.reason);
      }
    }
  }

  unsubscribeAll(): void {
    this.handlers.clear();
    this.wildcard.clear();
  }
}
