import { PrismaClient } from "@prisma/client";
import type { Logger } from "../../application/ports/Logger";

const globalForPrisma = globalThis as unknown as { videoconffPrisma?: PrismaClient };

export interface PrismaClientDeps {
  logger: Logger;
}

/**
 * Prisma client with a bounded connection pool. Reuses the same instance
 * across hot reloads in development.
 */
export class PrismaClientFactory {
  static create(deps: PrismaClientDeps): PrismaClient {
    const existing = globalForPrisma.videoconffPrisma;
    if (existing) return existing;

    const client = new PrismaClient({
      log: [
        { emit: "event", level: "error" },
        { emit: "event", level: "warn" },
      ],
    });

    (client as unknown as { $on: (type: string, cb: (e: { message: string; target: string }) => void) => void }).$on(
      "error",
      (e) => deps.logger.error({ target: e.target, message: e.message }, "prisma.error")
    );
    (client as unknown as { $on: (type: string, cb: (e: { message: string; target: string }) => void) => void }).$on(
      "warn",
      (e) => deps.logger.warn({ target: e.target, message: e.message }, "prisma.warn")
    );

    globalForPrisma.videoconffPrisma = client;
    return client;
  }
}
