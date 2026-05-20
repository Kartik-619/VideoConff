import Redis from "ioredis";

declare global {
  var redis: Redis | undefined;
}

const redisClient =
  global.redis ??
  new Redis(process.env.REDIS_URL!, {
    maxRetriesPerRequest: null,

    retryStrategy(times) {
      return Math.min(times * 50, 2000);
    },

    tls: {},
    enableReadyCheck: false,
  });

if (process.env.NODE_ENV !== "production") {
  global.redis = redisClient;
}

export const redis = redisClient;

redis.on("connect", () => {
  console.log("✅ Redis connected");
});

redis.on("error", (err) => {
  console.error("❌ Redis error:", err.message);
});
