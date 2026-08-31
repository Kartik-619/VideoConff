import { randomUUID } from "crypto";
import type { Redis } from "ioredis";
import type { DistributedLockPort } from "../../application/ports/DistributedLock";
import type { Logger } from "../../application/ports/Logger";
import { config } from "../../config/config";

/**
 * Distributed lock using SET NX PX (Redlock-style single instance). Release
 * is guarded by a Lua compare-and-delete so a stale lock owner can never
 * release another owner's lock.
 */
export class RedisLock implements DistributedLockPort {
  constructor(
    private readonly redis: Redis,
    private readonly logger: Logger,
    private readonly prefix = `${config.env.REDIS_KEY_PREFIX}lock:`
  ) {}

  private key(key: string): string {
    return `${this.prefix}${key}`;
  }

  async acquire(key: string, ttlMs: number, token = randomUUID()): Promise<boolean> {
    const result = await this.redis.set(this.key(key), token, "PX", ttlMs, "NX");
    if (result === "OK") {
      this.logger.debug({ key, token }, "lock.acquired");
      return true;
    }
    return false;
  }

  async release(key: string, token: string): Promise<void> {
    const script = `
      if redis.call('GET', KEYS[1]) == ARGV[1] then
        return redis.call('DEL', KEYS[1])
      else
        return 0
      end
    `;
    await this.redis.eval(script, 1, this.key(key), token);
    this.logger.debug({ key, token }, "lock.released");
  }

  async withLock<T>(
    key: string,
    ttlMs: number,
    timeoutMs: number,
    fn: () => Promise<T>
  ): Promise<T> {
    const token = randomUUID();
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      if (await this.acquire(key, ttlMs, token)) {
        try {
          return await fn();
        } finally {
          await this.release(key, token);
        }
      }
      await sleep(25 + Math.random() * 25);
    }

    throw new Error(`Timed out waiting for lock '${key}'`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
