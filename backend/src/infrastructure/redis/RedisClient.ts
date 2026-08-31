import Redis from "ioredis";
import type { Logger } from "../../application/ports/Logger";

export interface RedisClientDeps {
  url: string;
  logger: Logger;
  nodeName: string;
}

/**
 * Redis connection with retry strategy and connection pooling support.
 * A single client instance is shared across all infrastructure adapters.
 */
export class RedisClient {
  readonly client: Redis;
  private readonly nodeName: string;
  private readonly logger: Logger;

  constructor(deps: RedisClientDeps) {
    this.logger = deps.logger;
    this.nodeName = deps.nodeName;

    this.client = new Redis(deps.url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      retryStrategy(times) {
        return Math.min(times * 50, 2000);
      },
    });

    this.client.on("connect", () => {
      this.logger.info({ node: this.nodeName }, "redis.connected");
    });
    this.client.on("error", (err) => {
      this.logger.error({ node: this.nodeName, error: err.message }, "redis.error");
    });
    this.client.on("reconnecting", () => {
      this.logger.warn({ node: this.nodeName }, "redis.reconnecting");
    });
  }

  async ping(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === "PONG";
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.client.quit();
  }
}
