import { Router } from "express";
import type { RedisClient } from "../../../infrastructure/redis/RedisClient";
import type { PrismaClient } from "@prisma/client";
import type { Logger } from "../../../application/ports/Logger";

export interface HealthRoutesDeps {
  redis: RedisClient;
  prisma: PrismaClient;
  logger: Logger;
  startedAt: number;
}

/**
 * Health endpoints: basic liveness, Kubernetes-style liveness/readiness
 * probes and a version/uptime summary.
 */
export function createHealthRoutes(deps: HealthRoutesDeps): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json({
      status: "OK",
      service: "videoconff-signaling",
      uptimeSeconds: Math.floor((Date.now() - deps.startedAt) / 1000),
      version: process.env.npm_package_version ?? "1.0.0",
      timestamp: new Date().toISOString(),
    });
  });

  router.get("/api/health", (_req, res) => {
    res.status(200).json({
      status: "OK",
      service: "videoconff-signaling",
      timestamp: new Date().toISOString(),
    });
  });

  router.get("/api/health/live", (_req, res) => {
    res.status(200).json({ status: "live" });
  });

  router.get("/api/health/ready", async (_req, res) => {
    const checks: Record<string, "ok" | "degraded" | "down"> = {};
    let ready = true;

    const redisOk = await deps.redis.ping();
    checks.redis = redisOk ? "ok" : "down";
    if (!redisOk) ready = false;

    try {
      await deps.prisma.$queryRaw`SELECT 1`;
      checks.database = "ok";
    } catch {
      checks.database = "down";
      ready = false;
    }

    res.status(ready ? 200 : 503).json({
      status: ready ? "ready" : "not-ready",
      checks,
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}
