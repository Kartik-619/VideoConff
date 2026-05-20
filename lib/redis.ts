import Redis from "ioredis";

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

export const redis =
  globalForRedis.redis ??
  new Redis(process.env.REDIS_URL!, {
    tls: process.env.REDIS_URL?.startsWith("rediss://")
      ? {}
      : undefined,

    maxRetriesPerRequest: 3,

    retryStrategy(times) {
      console.log(`Redis retry ${times}`);
      return Math.min(times * 200, 3000);
    },

    keepAlive: 30000,

    enableReadyCheck: true,

    lazyConnect: false,
  });

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}

redis.on("connect", () => {
  console.log("✅ Redis connected");
});

redis.on("ready", () => {
  console.log("🚀 Redis ready");
});

redis.on("reconnecting", () => {
  console.log("⚠️ Redis reconnecting...");
});

redis.on("close", () => {
  console.log("🔌 Redis closed");
});

redis.on("error", (err) => {
  console.error("❌ Redis error:", err.message);
});
