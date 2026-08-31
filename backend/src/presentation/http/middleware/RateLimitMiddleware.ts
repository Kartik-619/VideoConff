import type { Request, Response, NextFunction } from "express";
import type { RateLimitService } from "../../../application/services/RateLimitService";
import type { MetricsService } from "../../../infrastructure/metrics/MetricsService";
import { AppError, ErrorCode } from "../../../domain/errors/AppError";
import { getRequestContext } from "./RequestContext";

/**
 * Distributed per-IP rate limiting for HTTP endpoints (fail2ban-aware).
 */
export function rateLimitMiddleware(
  rateLimitService: RateLimitService,
  metrics?: MetricsService
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const ctx = getRequestContext();
    const ip = ctx?.clientIp;

    try {
      const result = await rateLimitService.checkHttpByIp(ip);
      res.setHeader("x-ratelimit-limit", String(rateLimitService.httpPerIpLimit));
      res.setHeader("x-ratelimit-remaining", String(result.remaining));
      res.setHeader("x-ratelimit-reset", String(Math.ceil(result.retryAfterMs / 1000)));

      if (!result.allowed) {
        metrics?.incrementRateLimited("http");
        throw AppError.rateLimited("Too many requests");
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
