import Redis from "ioredis";

declare global {
  var redis: Redis | undefined;
}

const redisClient =
  global.redis ??
  new Redis(process.env.REDIS_URL!, {
    maxRetriesPerRequest: 3,

    retryStrategy(times) {
      console.log(`Redis retry attempt ${times}`);

      if (times > 20) {
        return null;
      }

      return Math.min(times * 200, 5000);
    },

    reconnectOnError(err) {
      const targetError = "READONLY";

      if (err.message.includes(targetError)) {
        return true;
      }

      return false;
    },

    keepAlive: 30000,

    enableReadyCheck: true,

    lazyConnect: true,
  });

if (process.env.NODE_ENV !== "production") {
  global.redis = redisClient;
}

export const redis = redisClient;

// connect manually if lazyConnect=true
redis.connect().catch(console.error);

redis.on("connect", () => {
  console.log("✅ Redis connected");
});

redis.on("ready", () => {
  console.log("🚀 Redis ready");
});

redis.on("reconnecting", () => {
  console.log("⚠️ Redis reconnecting...");
});

redis.on("error", (err) => {
  console.error("❌ Redis error:", err.message);
});

redis.on("close", () => {
  console.log("🔌 Redis connection closed");
});
