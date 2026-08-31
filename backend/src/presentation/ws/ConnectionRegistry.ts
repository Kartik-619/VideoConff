import type { SocketConnection } from "../../infrastructure/websocket/SocketConnection";
import type { Logger } from "../../application/ports/Logger";

/**
 * Tracks live connections by connection, user, room and peer id. Enables
 * multi-tab session management and fast lookup for forced disconnects
 * (meeting ended, user left via HTTP).
 */
export class ConnectionRegistry {
  private readonly byConnectionId = new Map<string, SocketConnection>();
  private readonly byPeerId = new Map<string, SocketConnection>();
  private readonly byRoom = new Map<string, Map<string, SocketConnection>>();
  private readonly byUser = new Map<string, Map<string, SocketConnection>>();

  constructor(private readonly logger: Logger) {}

  register(connection: SocketConnection): void {
    this.byConnectionId.set(connection.id, connection);
    if (connection.peerId) this.byPeerId.set(connection.peerId, connection);
    if (connection.userId) {
      let set = this.byUser.get(connection.userId);
      if (!set) {
        set = new Map();
        this.byUser.set(connection.userId, set);
      }
      set.set(connection.id, connection);
    }
  }

  bind(connection: SocketConnection, roomId: string, peerId: string): void {
    connection.roomId = roomId;
    connection.peerId = peerId;
    this.byPeerId.set(peerId, connection);

    let set = this.byRoom.get(roomId);
    if (!set) {
      set = new Map();
      this.byRoom.set(roomId, set);
    }
    set.set(connection.id, connection);
  }

  unregister(connection: SocketConnection): void {
    this.byConnectionId.delete(connection.id);
    if (connection.peerId) this.byPeerId.delete(connection.peerId);
    if (connection.roomId) {
      const set = this.byRoom.get(connection.roomId);
      set?.delete(connection.id);
      if (set && set.size === 0) this.byRoom.delete(connection.roomId);
    }
    if (connection.userId) {
      const set = this.byUser.get(connection.userId);
      set?.delete(connection.id);
      if (set && set.size === 0) this.byUser.delete(connection.userId);
    }
  }

  getByConnectionId(id: string): SocketConnection | undefined {
    return this.byConnectionId.get(id);
  }

  getByPeerId(peerId: string): SocketConnection | undefined {
    return this.byPeerId.get(peerId);
  }

  getByRoom(roomId: string): SocketConnection[] {
    return Array.from(this.byRoom.get(roomId)?.values() ?? []);
  }

  getByUser(userId: string): SocketConnection[] {
    return Array.from(this.byUser.get(userId)?.values() ?? []);
  }

  get connections(): SocketConnection[] {
    return Array.from(this.byConnectionId.values());
  }

  get count(): number {
    return this.byConnectionId.size;
  }

  /** Closes and unregisters every connection for a room. */
  async closeRoom(roomId: string): Promise<void> {
    const connections = this.getByRoom(roomId);
    for (const conn of connections) {
      conn.close(1000, "meeting ended");
      this.unregister(conn);
    }
    this.logger.info({ roomId, count: connections.length }, "registry.room-closed");
  }
}
