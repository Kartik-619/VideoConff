import type { Redis } from "ioredis";
import type { PubSubPort } from "../../application/ports/SharedPorts";
import type { Logger } from "../../application/ports/Logger";
import { config } from "../../config/config";

/**
 * Redis Pub/Sub adapter enabling cross-server communication between
 * horizontally scaled signaling nodes.
 */
export class RedisPubSub implements PubSubPort {
  private readonly subscriber: Redis;
  private readonly publisher: Redis;
  private readonly handlers = new Map<string, ((message: string) => void)[]>();
  private closed = false;

  constructor(
    redisUrl: string,
    private readonly logger: Logger,
    private readonly channel = config.env.REDIS_PUBSUB_CHANNEL
  ) {
    this.subscriber = new Redis(redisUrl, { maxRetriesPerRequest: null });
    this.publisher = new Redis(redisUrl, { maxRetriesPerRequest: null });
  }

  async publish(channel: string, message: unknown): Promise<void> {
    if (this.closed) return;
    try {
      await this.publisher.publish(channel, JSON.stringify(message));
    } catch (err) {
      this.logger.error({ channel, error: (err as Error).message }, "pubsub.publish-failed");
    }
  }

  async subscribe(channel: string, handler: (message: unknown) => void): Promise<() => Promise<void>> {
    const wrapped = (raw: string) => {
      try {
        handler(JSON.parse(raw));
      } catch (err) {
        this.logger.error({ channel, error: (err as Error).message }, "pubsub.parse-failed");
      }
    };

    const list = this.handlers.get(channel) ?? [];
    list.push(wrapped);
    this.handlers.set(channel, list);

    if (list.length === 1) {
      await this.subscriber.subscribe(channel);
      this.subscriber.on("message", (chan, message) => {
        const callbacks = this.handlers.get(chan);
        if (!callbacks) return;
        for (const cb of callbacks) cb(message);
      });
    }

    return async () => {
      const remaining = (this.handlers.get(channel) ?? []).filter((h) => h !== wrapped);
      if (remaining.length === 0) {
        this.handlers.delete(channel);
        await this.subscriber.unsubscribe(channel);
      } else {
        this.handlers.set(channel, remaining);
      }
    };
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    try {
      await this.subscriber.quit();
    } catch { /* ignore */ }
    try {
      await this.publisher.quit();
    } catch { /* ignore */ }
  }
}
