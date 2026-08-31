import type { Room } from "../../domain/entities/Room";
import type { Peer } from "../../domain/entities/Peer";

export interface RoomSnapshot {
  id: string;
  hostId: string | null;
  status: "CREATED" | "LIVE" | "ENDED";
  version: number;
  createdAt: number;
  updatedAt: number;
  peers: {
    id: string;
    userId: string;
    name: string;
    role: "HOST" | "PARTICIPANT";
    joinedAt: number;
  }[];
}

export interface RoomRepository {
  /** Returns the in-memory room if present on this node. */
  getLocal(roomId: string): Room | undefined;

  /** Loads a room (local cache or remote snapshot). */
  findById(roomId: string): Promise<Room | null>;

  /**
   * Atomically creates the room if it does not exist. Returns the existing
   * room otherwise (distributed-lock safe for concurrent creation).
   */
  createIfAbsent(room: Room): Promise<Room>;

  /** Persists the current state of the room. */
  save(room: Room): Promise<void>;

  /** Removes the room and all of its state. */
  delete(roomId: string): Promise<void>;

  /** Refreshes the room TTL so idle cleanup does not reap it. */
  touch(roomId: string): Promise<void>;

  /** Adds a peer to the room's participant roster. */
  addParticipant(roomId: string, peer: Peer): Promise<void>;

  /** Removes a participant from the roster. */
  removeParticipant(roomId: string, peer: Peer): Promise<void>;

  /** Lists the user ids currently in the room roster. */
  listParticipantIds(roomId: string): Promise<string[]>;

  /** Lists the room ids that still have live TTLs (for metrics/cleanup). */
  listActiveRoomIds(): Promise<string[]>;
}
