import Redis from "ioredis";

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

function createRedisClient(): Redis {
  const client = new Redis(process.env.REDIS_URL!, {
    tls: process.env.REDIS_URL?.startsWith("rediss://")
      ? {}
      : undefined,

    maxRetriesPerRequest: 3,

    retryStrategy(times) {
      if (times > 10) return null;
      return Math.min(times * 200, 3000);
    },

    keepAlive: 30000,

    enableReadyCheck: true,

    lazyConnect: true,

    connectTimeout: 5000,

    commandTimeout: 3000,
  });

  client.on("connect", () => {
    console.log("✅ Redis connected");
  });

  client.on("ready", () => {
    console.log("🚀 Redis ready");
  });

  client.on("reconnecting", () => {
    console.log("⚠️ Redis reconnecting...");
  });

  client.on("close", () => {
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

let _connected = false;

async function ensureConnected(): Promise<void> {
  if (_connected && redis.status === "ready") return;
  await redis.connect();
  _connected = true;
}

export async function safeRedis<T>(
  fn: (r: Redis) => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    await ensureConnected();
    return await fn(redis);
  } catch (err) {
    console.error("⚠️ Redis operation failed, using fallback:", (err as Error).message);
    return fallback;
  }
}
