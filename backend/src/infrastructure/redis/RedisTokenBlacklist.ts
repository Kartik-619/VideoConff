import type { Redis } from "ioredis";
import type {
  TokenBlacklistPort,
  SessionStorePort,
} from "../../application/ports/SharedPorts";
import { config } from "../../config/config";

const PREFIX = `${config.env.REDIS_KEY_PREFIX}`;

/**
 * Redis-backed token blacklist and user session store. Enables token
 * revocation and multi-tab session tracking across instances.
 */
export class RedisTokenBlacklist implements TokenBlacklistPort {
  constructor(private readonly redis: Redis) {}

  async add(tokenId: string, expiresInSeconds: number): Promise<void> {
    await this.redis.set(`${PREFIX}blacklist:${tokenId}`, "1", "EX", expiresInSeconds);
  }

  async isBlacklisted(tokenId: string): Promise<boolean> {
    const result = await this.redis.get(`${PREFIX}blacklist:${tokenId}`);
    return result !== null;
  }
}

export class RedisSessionStore implements SessionStorePort {
  constructor(private readonly redis: Redis) {}

  private key(userId: string): string {
    return `${PREFIX}session:${userId}`;
  }

  async setSession(userId: string, sessionId: string, ttlSeconds: number): Promise<void> {
    await this.redis.sadd(this.key(userId), sessionId);
    await this.redis.expire(this.key(userId), ttlSeconds);
  }

  async removeSession(userId: string, sessionId: string): Promise<void> {
    await this.redis.srem(this.key(userId), sessionId);
  }

  async listSessions(userId: string): Promise<string[]> {
    return this.redis.smembers(this.key(userId));
  }
}
