import type { PrismaClient } from "@prisma/client";
import type { UserRepository, UserInfo } from "../../../application/ports/UserRepository";
import type { Logger } from "../../../application/ports/Logger";

/**
 * Prisma-backed user repository using the cache-aside pattern: frequently
 * looked-up users are cached in memory with a short TTL, invalidated by
 * eviction after the TTL expires.
 */
export class PrismaUserRepository implements UserRepository {
  private readonly cache = new Map<string, { info: UserInfo; expiresAt: number }>();
  private readonly ttlMs: number;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly logger: Logger,
    ttlMs = 60_000
  ) {
    this.ttlMs = ttlMs;
  }

  async findById(userId: string): Promise<UserInfo | null> {
    const cached = this.cache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.info;
    }
    if (cached) this.cache.delete(userId);

    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, image: true },
      });
      if (!user) return null;
      const info: UserInfo = { id: user.id, name: user.name, image: user.image };
      this.cache.set(userId, { info, expiresAt: Date.now() + this.ttlMs });
      return info;
    } catch (err) {
      this.logger.error({ userId, error: (err as Error).message }, "user.find-failed");
      return null;
    }
  }

  async findManyByIds(userIds: string[]): Promise<UserInfo[]> {
    if (userIds.length === 0) return [];

    const unique = Array.from(new Set(userIds));
    const result: UserInfo[] = [];
    const missing: string[] = [];

    for (const id of unique) {
      const cached = this.cache.get(id);
      if (cached && cached.expiresAt > Date.now()) {
        result.push(cached.info);
      } else {
        missing.push(id);
      }
    }

    if (missing.length > 0) {
      try {
        const users = await this.prisma.user.findMany({
          where: { id: { in: missing } },
          select: { id: true, name: true, image: true },
        });
        for (const user of users) {
          const info: UserInfo = { id: user.id, name: user.name, image: user.image };
          this.cache.set(user.id, { info, expiresAt: Date.now() + this.ttlMs });
          result.push(info);
        }
      } catch (err) {
        this.logger.error({ count: missing.length, error: (err as Error).message }, "users.findMany-failed");
      }
    }

    return result;
  }

  invalidate(userId: string): void {
    this.cache.delete(userId);
  }
}
