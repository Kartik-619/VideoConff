import type { RateLimiterPort } from "../../application/ports/SharedPorts";
import type { Logger } from "../../application/ports/Logger";
import type { Redis } from "ioredis";
import { config } from "../../config/config";

/**
 * Distributed fixed-window rate limiter backed by Redis. Uses INCR + EXPIRE
 * atomically so it works correctly across multiple server instances.
 */
export class RedisRateLimiter implements RateLimiterPort {
  constructor(
    private readonly redis: Redis,
    private readonly logger: Logger,
    private readonly prefix = config.env.REDIS_KEY_PREFIX
  ) {}

  async consume(
    key: string,
    limit: number,
    windowMs: number
  ): Promise<{ allowed: boolean; remaining: number; retryAfterMs: number }> {
    const fullKey = `${this.prefix}ratelimit:${key}`;

    try {
      const script = `
        local key = KEYS[1]
        local window = tonumber(ARGV[1])
        local limit = tonumber(ARGV[2])
        local now = tonumber(ARGV[3])
        local resetAt = redis.call('GET', key .. ':reset')
        if not resetAt or now >= tonumber(resetAt) then
          redis.call('SET', key, '0')
          redis.call('SET', key .. ':reset', now + window)
          redis.call('EXPIRE', key, window)
          redis.call('EXPIRE', key .. ':reset', window)
          resetAt = now + window
        end
        local count = redis.call('INCR', key)
        local allowed = 1
        if count > limit then allowed = 0 end
        return {allowed, count, resetAt}
      `;
      const result = (await this.redis.eval(
        script,
        1,
        fullKey,
        String(windowMs),
        String(limit),
        String(Date.now())
      )) as [number, number, number];

      const allowed = result[0] === 1;
      const count = result[1];
      const resetAt = result[2];
      return {
        allowed,
        remaining: Math.max(0, limit - count),
        retryAfterMs: Math.max(0, resetAt - Date.now()),
      };
    } catch (err) {
      // Fail-open when Redis is unavailable so signaling keeps working.
      this.logger.error({ key, error: (err as Error).message }, "rate-limit.redis-failed");
      return { allowed: true, remaining: limit, retryAfterMs: 0 };
    }
  }
}
