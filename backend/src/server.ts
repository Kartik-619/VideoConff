import { config } from "./config/config";
import { createContainer, TOKENS } from "./di/registerServices";
import { buildApp } from "./presentation/http/AppServer";
import { SocketServer } from "./infrastructure/websocket/SocketServer";
import { WsController } from "./presentation/ws/WsController";
import { MessageDispatcher } from "./presentation/ws/dispatcher/MessageDispatcher";
import { ConnectionRegistry } from "./presentation/ws/ConnectionRegistry";
import { ClusterManager } from "./infrastructure/cluster/Cluster";
import { DomainEventType, EventBus } from "./domain/events/EventBus";
import { RedisPubSub } from "./infrastructure/redis/RedisPubSub";
import { RedisRoomRepository } from "./infrastructure/redis/RedisRoomRepository";
import type { Logger } from "./application/ports/Logger";
import type { PinoLogger } from "./infrastructure/logging/PinoLogger";
import type { RedisClient } from "./infrastructure/redis/RedisClient";
import type { PrismaClient } from "@prisma/client";
import type { BullMQQueue } from "./infrastructure/queue/BullMQQueue";
import http from "http";

export interface ServerHandle {
  shutdown: () => Promise<void>;
}

const STARTED_AT = Date.now();
const NODE_NAME = process.env.HOSTNAME ?? `${process.pid}`;

/**
 * Bootstrap: config -> DI -> HTTP + WebSocket servers -> graceful shutdown.
 * Supports optional cluster mode with sticky sessions.
 */
export async function startServer(): Promise<ServerHandle | null> {
  const logger = new (await import("./infrastructure/logging/PinoLogger")).PinoLogger({
    level: config.env.LOG_LEVEL,
  });

  if (config.features.clusterEnabled) {
    const clusterManager = new ClusterManager({});
    if (clusterManager.isPrimary) {
      clusterManager.startPrimary(config.env.PORT, logger);
      return null;
    }
  }

  const container = createContainer({ nodeName: NODE_NAME, startedAt: STARTED_AT, logger });

  const redisClient = container.resolve<RedisClient>(TOKENS.REDIS);
  const prisma = container.resolve<PrismaClient>(TOKENS.PRISMA);
  const eventBus = container.resolve<EventBus>(TOKENS.EVENT_BUS);
  const pubSub = container.resolve<RedisPubSub>(TOKENS.PUB_SUB);
  const queue = container.resolve<BullMQQueue>(TOKENS.QUEUE);
  const roomRepository = container.resolve<RedisRoomRepository>(TOKENS.ROOM_REPOSITORY);
  const lobbyService = container.resolve<import("./application/services/LobbyService").LobbyService>(TOKENS.LOBBY_SERVICE);
  const roomService = container.resolve<import("./application/services/RoomService").RoomService>(TOKENS.ROOM_SERVICE);
  const peerService = container.resolve<import("./application/services/PeerService").PeerService>(TOKENS.PEER_SERVICE);
  const metrics = container.get<import("./infrastructure/metrics/MetricsService").MetricsService>(TOKENS.METRICS);

  lobbyService.start();

  const app = buildApp(container);
  const httpServer = http.createServer(app);

  const clusterManager = new ClusterManager({});
  if (clusterManager.isWorker) {
    clusterManager.attachWorker(httpServer);
  }

  const socketServer = new SocketServer(httpServer, {
    logger,
    metrics,
    permessageDeflate: config.features.permessageDeflate,
    heartbeatIntervalMs: config.env.HEARTBEAT_INTERVAL_MS,
    maxConnections: config.env.RATE_LIMIT_MAX_WS_PER_IP,
    maxPayloadBytes: config.env.WS_MAX_MESSAGE_SIZE_BYTES,
  });

  const wsController = new WsController({
    socketServer,
    dispatcher: container.resolve<MessageDispatcher>(TOKENS.DISPATCHER),
    registry: container.resolve<ConnectionRegistry>(TOKENS.REGISTRY),
    authService: container.resolve<import("./application/services/AuthService").AuthService>(TOKENS.AUTH_SERVICE),
    rateLimitService: container.resolve<import("./application/services/RateLimitService").RateLimitService>(TOKENS.RATE_LIMIT_SERVICE),
    commandBus: container.resolve<import("./application/commands/CommandBus").CommandBus>(TOKENS.COMMAND_BUS),
    eventBus,
    metrics,
    logger,
  });
  wsController.start();

  await wireCrossNodeEvents({ pubSub, eventBus, registry: container.resolve<ConnectionRegistry>(TOKENS.REGISTRY), logger });

  await listen(httpServer, logger);

  const metricsTimer = setInterval(() => {
    void refreshMetrics(metrics, roomRepository, container, logger);
  }, 15_000);
  metricsTimer.unref?.();

  const cachePruneTimer = setInterval(() => {
    roomRepository.pruneLocalCache();
  }, 30_000);
  cachePruneTimer.unref?.();

  logger.info(
    {
      node: NODE_NAME,
      port: config.env.PORT,
      cluster: config.features.clusterEnabled ? "worker" : "disabled",
      queue: config.features.queueEnabled ? "enabled" : "disabled",
    },
    "server.started"
  );

  return {
    shutdown: () =>
      shutdown({
        httpServer,
        socketServer,
        wsController,
        roomService,
        peerService,
        lobbyService,
        redisClient,
        prisma,
        pubSub,
        queue,
        logger,
      }),
  };
}

async function listen(httpServer: http.Server, logger: Logger): Promise<void> {
  if (config.features.clusterEnabled) {
    const clusterManager = new ClusterManager({});
    if (clusterManager.isWorker) {
      logger.info({}, "server.worker-ready (primary owns the listening socket)");
      return;
    }
  }
  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(config.env.PORT, () => resolve());
  });
}

async function wireCrossNodeEvents(deps: {
  pubSub: RedisPubSub;
  eventBus: EventBus;
  registry: ConnectionRegistry;
  logger: Logger;
}): Promise<void> {
  const { pubSub, eventBus, registry, logger } = deps;

  try {
    await pubSub.subscribe(config.env.REDIS_PUBSUB_CHANNEL, (raw) => {
      const msg = raw as { type?: string; roomId?: string };
      if (msg?.type === "room.ended" && msg.roomId) {
        logger.info({ roomId: msg.roomId }, "cross-node room ended");
        void registry.closeRoom(msg.roomId);
      }
    });
  } catch (err) {
    logger.error({ error: (err as Error).message }, "pubsub.subscribe-failed");
  }

  eventBus.subscribe(DomainEventType.ROOM_ENDED, (event) => {
    const e = event as { payload: { room: { id: string } } };
    void pubSub.publish(config.env.REDIS_PUBSUB_CHANNEL, {
      type: "room.ended",
      roomId: e.payload.room.id,
    });
  });
}

async function refreshMetrics(
  metrics: import("./infrastructure/metrics/MetricsService").MetricsService | undefined,
  roomRepository: RedisRoomRepository,
  container: import("./di/container").Container,
  logger: Logger
): Promise<void> {
  if (!metrics) return;
  try {
    const roomIds = await roomRepository.listActiveRoomIds();
    metrics.setActiveRooms(roomIds.length);
    const registry = container.resolve<ConnectionRegistry>(TOKENS.REGISTRY);
    metrics.setActivePeers(registry.count);
  } catch (err) {
    logger.error({ error: (err as Error).message }, "metrics.refresh-failed");
  }
}

async function shutdown(deps: {
  httpServer: http.Server;
  socketServer: SocketServer;
  wsController: WsController;
  roomService: import("./application/services/RoomService").RoomService;
  peerService: import("./application/services/PeerService").PeerService;
  lobbyService: import("./application/services/LobbyService").LobbyService;
  redisClient: RedisClient;
  prisma: PrismaClient;
  pubSub: RedisPubSub;
  queue: BullMQQueue;
  logger: Logger;
}): Promise<void> {
  const { logger } = deps;
  logger.info({}, "server.shutdown-started");

  const timeout = setTimeout(() => {
    logger.warn({}, "server.shutdown-timeout (forcing exit)");
    process.exit(1);
  }, config.env.SHUTDOWN_TIMEOUT_MS);
  timeout.unref();

  try {
    deps.wsController.dispose();
    deps.lobbyService.dispose();
    deps.roomService.dispose();
    deps.peerService.dispose();

    await deps.socketServer.close();
    await new Promise<void>((resolve) => deps.httpServer.close(() => resolve()));
    await deps.queue.close();
    await deps.pubSub.close();
    await deps.redisClient.close();
    await deps.prisma.$disconnect();
  } catch (err) {
    logger.error({ error: (err as Error).message }, "server.shutdown-error");
  } finally {
    clearTimeout(timeout);
    logger.info({}, "server.shutdown-complete");
  }
}

if (require.main === module) {
  void startServer().catch((err) => {
    // eslint-disable-next-line no-console
    console.error("FATAL: failed to start server:", err);
    process.exit(1);
  });
}
