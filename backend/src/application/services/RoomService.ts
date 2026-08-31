import type { Room } from "../../domain/entities/Room";
import type { RoomRepository } from "../ports/RoomRepository";
import type { DistributedLockPort } from "../ports/DistributedLock";
import type { Logger } from "../ports/Logger";
import { EventBus, DomainEventType } from "../../domain/events/EventBus";
import { RoomFactory } from "../../domain/factories/RoomFactory";
import { AppError, ErrorCode } from "../../domain/errors/AppError";
import { config } from "../../config/config";

export interface RoomServiceDeps {
  roomRepository: RoomRepository;
  roomFactory: RoomFactory;
  lock: DistributedLockPort;
  eventBus: EventBus;
  logger: Logger;
  idleTtlMs?: number;
  emptyGraceMs?: number;
  now?: () => number;
}

/**
 * Room lifecycle service. Handles atomic room creation (distributed lock),
 * state persistence, idle cleanup with graceful degradation and publishes
 * room lifecycle domain events (created, deleted, empty, started, ended).
 */
export class RoomService {
  private readonly idleTtlMs: number;
  private readonly emptyGraceMs: number;
  private readonly now: () => number;
  private readonly cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private readonly deps: RoomServiceDeps) {
    this.idleTtlMs = deps.idleTtlMs ?? config.env.ROOM_IDLE_TTL_MS;
    this.emptyGraceMs = deps.emptyGraceMs ?? config.env.ROOM_EMPTY_GRACE_MS;
    this.now = deps.now ?? Date.now;
  }

  async getOrCreateRoom(roomId: string, hostId?: string | null): Promise<Room> {
    const existing = await this.deps.roomRepository.findById(roomId);
    if (existing) {
      await this.deps.roomRepository.touch(roomId);
      this.cancelCleanup(roomId);
      return existing;
    }

    const room = this.deps.roomFactory.create(roomId, hostId);

    const created = await this.deps.roomRepository.createIfAbsent(room);
    if (created === room) {
      this.deps.logger.info({ roomId, hostId }, "room.created");
      void this.deps.eventBus.emit({
        type: DomainEventType.ROOM_CREATED,
        payload: { room: created },
      });
    }
    return created;
  }

  async getRoom(roomId: string): Promise<Room | null> {
    return this.deps.roomRepository.findById(roomId);
  }

  async requireRoom(roomId: string): Promise<Room> {
    const room = await this.deps.roomRepository.findById(roomId);
    if (!room) {
      throw new AppError(ErrorCode.ROOM_NOT_FOUND, `Room ${roomId} not found`);
    }
    return room;
  }

  async touch(roomId: string): Promise<void> {
    await this.deps.roomRepository.touch(roomId);
  }

  /** Schedules cleanup of an empty room after a grace period. */
  scheduleCleanup(roomId: string): void {
    this.cancelCleanup(roomId);
    const timer = setTimeout(async () => {
      this.cleanupTimers.delete(roomId);
      try {
        const room = await this.deps.roomRepository.findById(roomId);
        if (!room || !room.isEmpty) return;
        await this.deleteRoom(roomId);
      } catch (err) {
        this.deps.logger.error(
          { roomId, error: (err as Error).message },
          "room.cleanup failed"
        );
      }
    }, this.emptyGraceMs);
    this.cleanupTimers.set(roomId, timer);
    this.deps.logger.debug(
      { roomId, graceMs: this.emptyGraceMs },
      "room.cleanup scheduled"
    );
  }

  cancelCleanup(roomId: string): void {
    const timer = this.cleanupTimers.get(roomId);
    if (timer) {
      clearTimeout(timer);
      this.cleanupTimers.delete(roomId);
    }
  }

  async deleteRoom(roomId: string): Promise<void> {
    const room = await this.deps.roomRepository.findById(roomId);
    this.cancelCleanup(roomId);
    await this.deps.roomRepository.delete(roomId);
    if (room) {
      void this.deps.eventBus.emit({
        type: DomainEventType.ROOM_DELETED,
        payload: { room },
      });
    }
    this.deps.logger.info({ roomId }, "room.deleted");
  }

  async endRoom(roomId: string): Promise<Room> {
    const room = await this.requireRoom(roomId);
    room.end();
    await this.deps.roomRepository.save(room);
    this.cancelCleanup(roomId);
    void this.deps.eventBus.emit({
      type: DomainEventType.ROOM_ENDED,
      payload: { room },
    });
    this.deps.logger.info({ roomId }, "room.ended");
    return room;
  }

  async startRoom(roomId: string): Promise<Room> {
    const room = await this.requireRoom(roomId);
    room.start();
    await this.deps.roomRepository.save(room);
    void this.deps.eventBus.emit({
      type: DomainEventType.ROOM_STARTED,
      payload: { room },
    });
    this.deps.logger.info({ roomId }, "room.started");
    return room;
  }

  async save(room: Room): Promise<void> {
    await this.deps.roomRepository.save(room);
  }

  /** Clears all pending cleanup timers (shutdown path). */
  dispose(): void {
    for (const timer of this.cleanupTimers.values()) {
      clearTimeout(timer);
    }
    this.cleanupTimers.clear();
  }
}
