import type { RateLimiterPort } from "../ports/SharedPorts";
import type { Logger } from "../ports/Logger";
import { AppError, ErrorCode } from "../../domain/errors/AppError";
import { config } from "../../config/config";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export interface RateLimitServiceDeps {
  rateLimiter: RateLimiterPort;
  logger: Logger;
  windowMs?: number;
  maxWsPerIp?: number;
  maxWsPerUser?: number;
  maxWsPerRoom?: number;
  maxHttpPerIp?: number;
}

/**
 * Distributed rate limiting (Redis-backed) applied per IP, per user and per
 * room, plus a fail2ban-like ban mechanism: repeated violations within a
 * window escalate to a temporary IP ban.
 */
export class RateLimitService {
  private readonly windowMs: number;
  private readonly maxWsPerIp: number;
  private readonly maxWsPerUser: number;
  private readonly maxWsPerRoom: number;
  private readonly maxHttpPerIp: number;

  constructor(private readonly deps: RateLimitServiceDeps) {
    this.windowMs = deps.windowMs ?? config.env.RATE_LIMIT_WINDOW_MS;
    this.maxWsPerIp = deps.maxWsPerIp ?? config.env.RATE_LIMIT_MAX_WS_PER_IP;
    this.maxWsPerUser = deps.maxWsPerUser ?? config.env.RATE_LIMIT_MAX_WS_PER_USER;
    this.maxWsPerRoom = deps.maxWsPerRoom ?? config.env.RATE_LIMIT_MAX_WS_PER_ROOM;
    this.maxHttpPerIp = deps.maxHttpPerIp ?? config.env.RATE_LIMIT_MAX_HTTP_PER_IP;
  }

  async check(key: string, limit: number): Promise<RateLimitResult> {
    const result = await this.deps.rateLimiter.consume(key, limit, this.windowMs);
    return {
      allowed: result.allowed,
      remaining: result.remaining,
      retryAfterMs: result.retryAfterMs,
    };
  }

  async checkWsByIp(clientIp: string | undefined): Promise<RateLimitResult> {
    if (!clientIp) return { allowed: true, remaining: this.maxWsPerIp, retryAfterMs: 0 };
    return this.check(`ws:ip:${clientIp}`, this.maxWsPerIp);
  }

  async checkWsByUser(userId: string): Promise<RateLimitResult> {
    return this.check(`ws:user:${userId}`, this.maxWsPerUser);
  }

  async checkWsByRoom(roomId: string): Promise<RateLimitResult> {
    return this.check(`ws:room:${roomId}`, this.maxWsPerRoom);
  }

  async checkHttpByIp(clientIp: string | undefined): Promise<RateLimitResult> {
    if (!clientIp) return { allowed: true, remaining: this.maxHttpPerIp, retryAfterMs: 0 };
    return this.check(`http:ip:${clientIp}`, this.maxHttpPerIp);
  }

  get httpPerIpLimit(): number {
    return this.maxHttpPerIp;
  }

  /**
   * Records a security-relevant violation. After a threshold of violations
   * the key is banned for `banSeconds`, which effectively blocks the client
   * (fail2ban-style).
   */
  async reportViolation(key: string, banThreshold = 10, banSeconds = 300): Promise<void> {
    const violations = await this.deps.rateLimiter.consume(`viol:${key}`, banThreshold, 600_000);
    if (!violations.allowed) {
      await this.deps.rateLimiter.consume(`ban:${key}`, 1, banSeconds * 1000);
      this.deps.logger.warn({ key, banSeconds }, "rate-limit: client banned");
    }
  }

  async assertAllowed(result: RateLimitResult, key: string): Promise<void> {
    if (!result.allowed) {
      await this.reportViolation(key);
      throw AppError.rateLimited("Too many requests", {
        retryAfterMs: result.retryAfterMs,
      });
    }
  }
}
