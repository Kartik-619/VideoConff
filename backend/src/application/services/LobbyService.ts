import { EventBus, DomainEventType, DomainEvent } from "../../domain/events/EventBus";
import type { RoomRepository } from "../ports/RoomRepository";
import type { UserRepository } from "../ports/UserRepository";
import type { Logger } from "../ports/Logger";
import type { Room } from "../../domain/entities/Room";

export interface LobbyServiceDeps {
  eventBus: EventBus;
  roomRepository: RoomRepository;
  userRepository: UserRepository;
  logger: Logger;
}

/**
 * Lobby participant tracking. Observes peer lifecycle events (Observer
 * pattern), keeps the distributed participant roster up to date and
 * broadcasts `lobbyUpdate` to all peers in the room.
 */
export class LobbyService {
  private readonly unsubscribers: (() => void)[] = [];

  constructor(private readonly deps: LobbyServiceDeps) {}

  start(): void {
    this.unsubscribers.push(
      this.deps.eventBus.subscribe(DomainEventType.PEER_JOINED, (e) => {
        void this.onPeerChanged(e as Extract<DomainEvent, { type: typeof DomainEventType.PEER_JOINED }>);
      }),
      this.deps.eventBus.subscribe(DomainEventType.PEER_LEFT, (e) => {
        void this.onPeerChanged(e as Extract<DomainEvent, { type: typeof DomainEventType.PEER_LEFT }>);
      })
    );
  }

  private async onPeerChanged(event: {
    payload: { room: Room; peer: { userId: string } };
  }): Promise<void> {
    const { room, peer } = event.payload;
    try {
      if (event.type === DomainEventType.PEER_JOINED) {
        await this.deps.roomRepository.addParticipant(room.id, peer as never);
      } else {
        await this.deps.roomRepository.removeParticipant(room.id, peer as never);
      }
      await this.broadcastLobby(room);
    } catch (err) {
      this.deps.logger.error(
        { roomId: room.id, error: (err as Error).message },
        "lobby.update failed"
      );
    }
  }

  async broadcastLobby(room: Room): Promise<void> {
    try {
      const ids = await this.deps.roomRepository.listParticipantIds(room.id);
      let participants: { id: string; name: string }[] = [];
      if (ids.length > 0) {
        const users = await this.deps.userRepository.findManyByIds(ids);
        participants = users.map((u) => ({ id: u.id, name: u.name }));
      }
      const payload = { type: "lobbyUpdate", participants };
      for (const peer of room.activePeers) {
        peer.socket.send(payload);
      }
    } catch (err) {
      this.deps.logger.error(
        { roomId: room.id, error: (err as Error).message },
        "lobby.broadcast failed"
      );
    }
  }

  async getParticipants(roomId: string): Promise<{ id: string; name: string }[]> {
    const ids = await this.deps.roomRepository.listParticipantIds(roomId);
    if (ids.length === 0) return [];
    const users = await this.deps.userRepository.findManyByIds(ids);
    return users.map((u) => ({ id: u.id, name: u.name }));
  }

  dispose(): void {
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers.length = 0;
  }
}
