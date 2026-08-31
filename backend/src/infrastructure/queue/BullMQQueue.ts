import { Queue, Worker, type ConnectionOptions } from "bullmq";
import type { MessageQueuePort, QueueJobOptions } from "../../application/ports/MessageQueue";
import type { Logger } from "../../application/ports/Logger";
import { config } from "../../config/config";

const QUEUE_NAME = "videoconff-signaling";
const DLQ_NAME = `${QUEUE_NAME}-dlq`;

export interface BullMQQueueDeps {
  connection: ConnectionOptions;
  logger: Logger;
  enabled: boolean;
  processJob?: (jobName: string, payload: unknown) => Promise<void>;
}

/**
 * BullMQ-based async message queue. Heavy operations (e.g. database writes)
 * are queued with retry + exponential backoff. Jobs that exhaust their
 * attempts land in the dead letter queue and are monitored.
 */
export class BullMQQueue implements MessageQueuePort {
  private readonly enabled: boolean;
  private queue?: Queue;
  private worker?: Worker;
  private dlq?: Queue;
  private readonly logger: Logger;

  constructor(private readonly deps: BullMQQueueDeps) {
    this.enabled = deps.enabled;
    this.logger = deps.logger;
    if (deps.enabled) {
      this.init().catch((err) => {
        this.logger.error(
          { error: (err as Error).message },
          "queue.init-failed (running without queue)"
        );
      });
    }
  }

  private async init(): Promise<void> {
    this.queue = new Queue(QUEUE_NAME, { connection: this.deps.connection });
    this.dlq = new Queue(DLQ_NAME, { connection: this.deps.connection });
    this.worker = new Worker(
      QUEUE_NAME,
      async (job) => {
        this.logger.debug(
          { jobId: job.id, name: job.name, attempt: job.attemptsMade + 1 },
          "queue.job-started"
        );
        try {
          await this.deps.processJob?.(job.name, job.data);
        } catch (err) {
          const errMsg = (err as Error).message;
          if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
            await this.dlq!.add(job.name, job.data, {
              jobId: job.id,
              attempts: 1,
            });
            this.logger.error(
              { jobId: job.id, name: job.name, error: errMsg },
              "queue.job-moved-to-dlq"
            );
          }
          throw err;
        }
      },
      {
        connection: this.deps.connection,
        concurrency: config.env.QUEUE_CHAT_PERSISTENCE_CONCURRENCY,
      }
    );

    this.worker.on("failed", (job, err) => {
      this.logger.error(
        { jobId: job?.id, name: job?.name, error: err.message },
        "queue.job-failed"
      );
    });
    this.logger.info({}, "queue.initialized");
  }

  isEnabled(): boolean {
    return this.enabled && !!this.queue;
  }

  async add(
    jobName: string,
    payload: unknown,
    options: QueueJobOptions = {}
  ): Promise<string | undefined> {
    if (!this.isEnabled()) return undefined;
    return this.queue!.add(jobName, payload as object, {
      attempts: options.attempts ?? 3,
      backoff: options.backoffMs
        ? {
            type: options.backoffType ?? "exponential",
            delay: options.backoffMs,
          }
        : undefined,
      delay: options.delayMs,
      removeOnComplete: options.removeOnComplete ?? true,
      jobId: options.jobId,
    }).then((job) => job.id);
  }

  async close(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    await this.dlq?.close();
  }
}
