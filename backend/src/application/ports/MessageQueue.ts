export interface MessageQueuePort {
  add(jobName: string, payload: unknown, options?: QueueJobOptions): Promise<string | undefined>;
  isEnabled(): boolean;
  close(): Promise<void>;
}

export interface QueueJobOptions {
  attempts?: number;
  backoffMs?: number;
  backoffType?: "fixed" | "exponential";
  delayMs?: number;
  removeOnComplete?: boolean;
  jobId?: string;
}

export const QueueJobs = {
  CHAT_PERSISTENCE: "chat.persistence",
  ROOM_CLEANUP: "room.cleanup",
} as const;
