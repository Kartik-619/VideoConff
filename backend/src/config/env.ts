import dotenv from "dotenv";
import path from "path";
import { z } from "zod";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  PORT: z.coerce.number().int().positive().default(8080),

  NEXTAUTH_SECRET: z.string().min(8, "NEXTAUTH_SECRET is required"),
  NEXTAUTH_URL: z.string().url().optional(),

  REDIS_URL: z.string().default("redis://localhost:6379"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  WS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(120),
  WS_MAX_MESSAGE_SIZE_BYTES: z.coerce.number().int().positive().default(100 * 1024),
  ROOM_IDLE_TTL_MS: z.coerce.number().int().positive().default(30_000),
  ROOM_EMPTY_GRACE_MS: z.coerce.number().int().positive().default(30_000),
  HEARTBEAT_INTERVAL_MS: z.coerce.number().int().positive().default(30_000),
  HEARTBEAT_TIMEOUT_MS: z.coerce.number().int().positive().default(75_000),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX_WS_PER_IP: z.coerce.number().int().positive().default(120),
  RATE_LIMIT_MAX_WS_PER_USER: z.coerce.number().int().positive().default(120),
  RATE_LIMIT_MAX_WS_PER_ROOM: z.coerce.number().int().positive().default(600),
  RATE_LIMIT_MAX_HTTP_PER_IP: z.coerce.number().int().positive().default(120),

  REDIS_KEY_PREFIX: z.string().default("videoconff:"),
  REDIS_PUBSUB_CHANNEL: z.string().default("videoconff:events"),

  ENABLE_QUEUE: z
    .string()
    .default("true")
    .transform((v) => v === "true" || v === "1"),
  QUEUE_CHAT_PERSISTENCE_CONCURRENCY: z.coerce.number().int().positive().default(2),

  ENABLE_CLUSTER: z
    .string()
    .default("false")
    .transform((v) => v === "true" || v === "1"),
  CLUSTER_WORKERS: z.coerce.number().int().positive().default(4),

  ENABLE_PERMESSAGE_DEFLATE: z
    .string()
    .default("true")
    .transform((v) => v === "true" || v === "1"),

  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),

  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  console.error(`[config] Invalid environment configuration:\n${details}`);
  process.exit(1);
}

export const env = parsed.data;
