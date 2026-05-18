"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redis = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
exports.redis = new ioredis_1.default(process.env.REDIS_URL, {
    maxRetriesPerRequest: null,
    retryStrategy(times) {
        return Math.min(times * 50, 2000);
    }
});
// Logs for debugging
exports.redis.on("connect", () => {
    console.log("✅ Redis connected");
});
exports.redis.on("error", (err) => {
    console.error("❌ Redis error:", err);
});
exports.redis.on("reconnecting", () => {
    console.warn("⚠️ Redis reconnecting...");
});
//# sourceMappingURL=redis.js.map