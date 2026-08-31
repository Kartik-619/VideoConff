import type { Redis } from "ioredis";
import type { Room } from "../../domain/entities/Room";
import type { Peer } from "../../domain/entities/Peer";
import type { RoomRepository, RoomSnapshot } from "../../application/ports/RoomRepository";
import type { DistributedLockPort } from "../../application/ports/DistributedLock";
import type { Logger } from "../../application/ports/Logger";
import { RoomFactory } from "../../domain/factories/RoomFactory";
import { config } from "../../config/config";

const PREFIX = config.env.REDIS_KEY_PREFIX;

export interface RedisRoomRepositoryDeps {
  redis: Redis;
  lock: DistributedLockPort;
  roomFactory: RoomFactory;
  logger: Logger;
  ttlSeconds?: number;
  now?: () => number;
}

/**
 * Room repository backed by Redis for distributed state. Each node keeps a
 * local in-memory cache of rooms whose peers are connected to it (node-local
 * socket references), while room metadata, roster and version are persisted
 * to Redis so state is shared across horizontally scaled instances.
 */
export class RedisRoomRepository implements RoomRepository {
  private readonly localCache = new Map<string, Room>();
  private readonly ttlSeconds: number;
  private readonly now: () => number;

  constructor(private readonly deps: RedisRoomRepositoryDeps) {
    this.ttlSeconds = deps.ttlSeconds ?? Math.max(1, Math.floor(config.env.ROOM_IDLE_TTL_MS / 1000));
    this.now = deps.now ?? Date.now;
  }

  private roomKey(roomId: string): string {
    return `${PREFIX}room:${roomId}`;
  }

  private participantsKey(roomId: string): string {
    return `${PREFIX}room:${roomId}:participants`;
  }

  private roomsSetKey(): string {
    return `${PREFIX}rooms`;
  }

  getLocal(roomId: string): Room | undefined {
    return this.localCache.get(roomId);
  }

  async findById(roomId: string): Promise<Room | null> {
    const cached = this.localCache.get(roomId);
    if (cached) return cached;

    try {
      const raw = await this.deps.redis.get(this.roomKey(roomId));
      if (!raw) return null;
      const snapshot = JSON.parse(raw) as RoomSnapshot;
      const room = this.deps.roomFactory.hydrate(snapshot);
      this.localCache.set(roomId, room);
      return room;
    } catch (err) {
      this.deps.logger.error(
        { roomId, error: (err as Error).message },
        "repo.room-load-failed"
      );
      return null;
    }
  }

  async createIfAbsent(room: Room): Promise<Room> {
    const existing = await this.findById(room.id);
    if (existing) return existing;

    return this.deps.lock.withLock(`room:${room.id}`, 5000, 5000, async () => {
      const recheck = await this.findById(room.id);
      if (recheck) return recheck;

      await this.persist(room, /* withTtl */ true);
      this.localCache.set(room.id, room);
      this.deps.logger.info({ roomId: room.id }, "repo.room-created");
      return room;
    });
  }

  async save(room: Room): Promise<void> {
    this.localCache.set(room.id, room);
    await this.persist(room, true);
  }

  private async persist(room: Room, withTtl: boolean): Promise<void> {
    const snapshot: RoomSnapshot = {
      id: room.id,
      hostId: room.hostId,
      status: room.status,
      version: room.version,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
      peers: room.activePeers.map((p) => ({
        id: p.id,
        userId: p.userId,
        name: p.name,
        role: p.role,
        joinedAt: p.joinedAt,
      })),
    };

    const pipeline = this.deps.redis.pipeline();
    pipeline.set(this.roomKey(room.id), JSON.stringify(snapshot));
    if (withTtl) {
      pipeline.expire(this.roomKey(room.id), this.ttlSeconds);
    }
    pipeline.sadd(this.roomsSetKey(), room.id);
    pipeline.expire(this.roomsSetKey(), this.ttlSeconds);

    if (room.peerCount > 0) {
      pipeline.sadd(this.participantsKey(room.id), ...room.activePeers.map((p) => p.userId));
      pipeline.expire(this.participantsKey(room.id), this.ttlSeconds);
    }

    try {
      await pipeline.exec();
    } catch (err) {
      this.deps.logger.error(
        { roomId: room.id, error: (err as Error).message },
        "repo.room-persist-failed"
      );
    }
  }

  async delete(roomId: string): Promise<void> {
    this.localCache.delete(roomId);
    const pipeline = this.deps.redis.pipeline();
    pipeline.del(this.roomKey(roomId));
    pipeline.del(this.participantsKey(roomId));
    pipeline.srem(this.roomsSetKey(), roomId);
    try {
      await pipeline.exec();
    } catch (err) {
      this.deps.logger.error(
        { roomId, error: (err as Error).message },
        "repo.room-delete-failed"
      );
    }
  }

  async touch(roomId: string): Promise<void> {
    const pipeline = this.deps.redis.pipeline();
    pipeline.expire(this.roomKey(roomId), this.ttlSeconds);
    pipeline.expire(this.participantsKey(roomId), this.ttlSeconds);
    try {
      await pipeline.exec();
    } catch (err) {
      this.deps.logger.error({ roomId, error: (err as Error).message }, "repo.room-touch-failed");
    }
  }

  async addParticipant(roomId: string, peer: Peer): Promise<void> {
    await this.deps.redis.sadd(this.participantsKey(roomId), peer.userId);
    await this.deps.redis.expire(this.participantsKey(roomId), this.ttlSeconds);
  }

  async removeParticipant(roomId: string, peer: Peer): Promise<void> {
    await this.deps.redis.srem(this.participantsKey(roomId), peer.userId);
  }

  async listParticipantIds(roomId: string): Promise<string[]> {
    return this.deps.redis.smembers(this.participantsKey(roomId));
  }

  async listActiveRoomIds(): Promise<string[]> {
    return this.deps.redis.smembers(this.roomsSetKey());
  }

  /**
   * Prunes empty rooms from the local cache that have not been touched
   * recently. Prevents unbounded in-memory growth.
   */
  pruneLocalCache(maxAgeMs = config.env.ROOM_IDLE_TTL_MS): void {
    const cutoff = this.now() - maxAgeMs;
    for (const [roomId, room] of this.localCache) {
      if (room.isEmpty && room.updatedAt < cutoff) {
        this.localCache.delete(roomId);
      }
    }
  }
}
