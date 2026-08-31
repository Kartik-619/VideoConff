import cluster from "cluster";
import os from "os";
import net from "net";
import type { Server as HttpServer } from "http";
import type { Logger } from "../../application/ports/Logger";
import { config } from "../../config/config";

const STICKY_MSG = "sticky-connection";

/**
 * Node cluster with sticky-session affinity. The primary opens a single
 * listening socket and forwards each incoming TCP connection to a worker
 * selected by hashing the client IP, guaranteeing that all connections from
 * one client (including WebSocket upgrades) reach the same worker.
 */
export class ClusterManager {
  private readonly workerCount: number;

  constructor(deps: { workerCount?: number }) {
    this.workerCount = deps.workerCount ?? config.env.CLUSTER_WORKERS;
  }

  get isPrimary(): boolean {
    return cluster.isPrimary;
  }

  get isWorker(): boolean {
    return cluster.isWorker;
  }

  /**
   * Forks workers and starts the sticky listener on the primary.
   * Returns true when the process should act as primary (callers in primary
   * mode must not build the app), false when it should act as a worker.
   */
  startPrimary(port: number, logger: Logger): boolean {
    if (!cluster.isPrimary) return false;

    const count = Math.min(this.workerCount, os.cpus().length || 1);
    logger.info({ workers: count }, "cluster.primary-starting");

    for (let i = 0; i < count; i += 1) {
      cluster.fork();
    }

    cluster.on("exit", (worker, code, signal) => {
      logger.warn(
        { pid: worker.process.pid, code, signal },
        "cluster.worker-exited (restarting)"
      );
      cluster.fork();
    });

    const server = net.createServer({ pauseOnConnect: true }, (connection) => {
      const ip = connection.remoteAddress ?? "unknown";
      const workerId = hashIp(ip) % count;
      const worker = Object.values(cluster.workers ?? {})[workerId];
      if (worker && worker.isConnected()) {
        worker.send(STICKY_MSG, connection);
      } else {
        connection.destroy();
      }
    });

    server.listen(port, () => {
      logger.info({ port }, "cluster.primary-listening");
    });

    return true;
  }

  /** Registers the worker-side handoff from the primary. */
  attachWorker(server: HttpServer): void {
    if (!cluster.isWorker) return;
    process.on("message", (msg: unknown, socket: unknown) => {
      if (msg === STICKY_MSG && socket && typeof socket === "object") {
        server.emit("connection", socket as net.Socket);
      }
    });
  }
}

function hashIp(ip: string): number {
  const normalized = ip.replace(/^::ffff:/, "");
  let hash = 5381;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash * 33) ^ normalized.charCodeAt(i);
  }
  return Math.abs(hash);
}
