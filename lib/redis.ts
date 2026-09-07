import Redis from "ioredis";

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

let _connected = false;

const CONNECT_HARD_TIMEOUT_MS = 2000;

function createRedisClient(): Redis {
  const client = new Redis(process.env.REDIS_URL!, {
    tls: process.env.REDIS_URL?.startsWith("rediss://")
      ? {}
      : undefined,

    maxRetriesPerRequest: 1,

    retryStrategy(times) {
      if (times > 3) return null;
      return Math.min(times * 100, 500);
    },

    keepAlive: 30000,

    enableReadyCheck: true,

    lazyConnect: true,

    connectTimeout: 2000,

    commandTimeout: 2000,
  });

  client.on("connect", () => {
    _connected = true;
    console.log("✅ Redis connected");
  });

  client.on("ready", () => {
    _connected = true;
    console.log("🚀 Redis ready");
  });

  client.on("reconnecting", () => {
    console.log("⚠️ Redis reconnecting...");
  });

  client.on("close", () => {
    _connected = false;
    console.log("🔌 Redis closed");
  });

  client.on("error", (err) => {
    console.error("❌ Redis error:", err.message);
  });

  return client;
}

export const redis = globalForRedis.redis ?? createRedisClient();

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}

async function ensureConnected(): Promise<void> {
  if (_connected && redis.status === "ready") return;

  if (
    redis.status === "connect" ||
    redis.status === "connecting" ||
    redis.status === "reconnecting"
  ) {
    return;
  }

  try {
    await Promise.race([
      redis.connect(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("Redis connect timed out")),
          CONNECT_HARD_TIMEOUT_MS
        )
      ),
    ]);
    _connected = true;
  } catch {
    _connected = false;
    throw new Error("Redis unavailable");
  }
}

export async function safeRedis<T>(
  fn: (r: Redis) => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    await ensureConnected();
    return await fn(redis);
  } catch (err) {
    console.error(
      "⚠️ Redis operation failed, using fallback:",
      (err as Error).message
    );
    return fallback;
  }
}
