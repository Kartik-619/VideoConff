import express from "express";
import type { Application } from "express";
import cors from "cors";
import bodyParser from "body-parser";
import compression from "compression";
import type { Container } from "../../di/container";
import type { PinoLogger } from "../../infrastructure/logging/PinoLogger";
import type { RedisClient } from "../../infrastructure/redis/RedisClient";
import type { RateLimitService } from "../../application/services/RateLimitService";
import type { MetricsService } from "../../infrastructure/metrics/MetricsService";
import type { CommandBus } from "../../application/commands/CommandBus";
import type { AuthService } from "../../application/services/AuthService";
import type { RoomService } from "../../application/services/RoomService";
import type { ConnectionRegistry } from "../ws/ConnectionRegistry";
import type { MeetingRepository } from "../../application/ports/MeetingRepository";
import type { JwtService } from "../../infrastructure/auth/JwtService";
import type { PrismaClient } from "@prisma/client";
import { createHealthRoutes } from "./routes/HealthRoutes";
import { createMeetingRoutes } from "./routes/MeetingRoutes";
import { createMetricsRoutes } from "./routes/MetricsRoutes";
import { requestContextMiddleware } from "./middleware/RequestContext";
import { rateLimitMiddleware } from "./middleware/RateLimitMiddleware";
import { errorHandler } from "./middleware/ErrorHandler";
import { auditLogger } from "./middleware/AuditLogger";
import { PinoLogger as PinoLoggerImpl } from "../../infrastructure/logging/PinoLogger";
import { config } from "../../config/config";

/**
 * Assembles the Express HTTP application (presentation layer): CORS,
 * compression, request context, audit logging, rate limiting, routes and the
 * global error handler. Dependencies are resolved from the DI container.
 */
export function buildApp(container: Container): Application {
  const logger = container.resolve<PinoLogger>("logger");
  const redis = container.resolve<RedisClient>("redis");
  const prisma = container.resolve<PrismaClient>("prisma");
  const rateLimitService = container.resolve<RateLimitService>("rateLimitService");
  const metrics = container.get<MetricsService>("metrics");
  const commandBus = container.resolve<CommandBus>("commandBus");
  const authService = container.resolve<AuthService>("authService");
  const roomService = container.resolve<RoomService>("roomService");
  const registry = container.resolve<ConnectionRegistry>("registry");
  const meetingRepository = container.resolve<MeetingRepository>("meetingRepository");
  const jwtService = container.resolve<JwtService>("jwtService");
  const startedAt = container.resolve<number>("startedAt");

  const app = express();
  const auditLog = new PinoLoggerImpl({ level: "info" });

  app.disable("x-powered-by");

  app.use(
    cors({
      origin: corsOrigin(),
      credentials: true,
    })
  );
  app.use(compression({ threshold: 1024 }));
  app.use(bodyParser.json({ limit: "64kb" }));
  app.use(requestContextMiddleware);
  app.use(rateLimitMiddleware(rateLimitService, metrics));
  app.use(auditLogger(auditLog));

  app.use(
    createHealthRoutes({
      redis,
      prisma,
      logger,
      startedAt,
    })
  );

  app.use(
    createMeetingRoutes({
      commandBus,
      authService,
      roomService,
      registry,
      meetingRepository,
      jwtService,
      logger,
    })
  );

  app.use(createMetricsRoutes(metrics));

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  app.use(errorHandler(logger));

  return app;
}

function corsOrigin(): string | string[] | undefined {
  if (config.env.NODE_ENV === "production") {
    return config.env.NEXTAUTH_URL ?? "*";
  }
  return ["http://localhost:3000", "http://localhost:3001"];
}
