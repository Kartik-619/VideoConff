import { Container, lazy } from "./container";
import { config } from "../config/config";
import { PinoLogger } from "../infrastructure/logging/PinoLogger";
import { RedisClient } from "../infrastructure/redis/RedisClient";
import { RedisRateLimiter } from "../infrastructure/redis/RedisRateLimiter";
import { RedisLock } from "../infrastructure/redis/RedisLock";
import { RedisPubSub } from "../infrastructure/redis/RedisPubSub";
import { RedisRoomRepository } from "../infrastructure/redis/RedisRoomRepository";
import {
  RedisTokenBlacklist,
  RedisSessionStore,
} from "../infrastructure/redis/RedisTokenBlacklist";
import { MetricsService } from "../infrastructure/metrics/MetricsService";
import { PrismaClientFactory } from "../infrastructure/persistence/PrismaClient";
import { PrismaUserRepository } from "../infrastructure/persistence/repositories/PrismaUserRepository";
import { PrismaMeetingRepository } from "../infrastructure/persistence/repositories/PrismaMeetingRepository";
import { PrismaChatRepository } from "../infrastructure/persistence/repositories/PrismaChatRepository";
import { JwtService } from "../infrastructure/auth/JwtService";
import { BullMQQueue } from "../infrastructure/queue/BullMQQueue";
import { RoomFactory } from "../domain/factories/RoomFactory";
import { PeerFactory } from "../domain/factories/PeerFactory";
import { EventBus } from "../domain/events/EventBus";
import { RoomService } from "../application/services/RoomService";
import { PeerService } from "../application/services/PeerService";
import { SignalingService } from "../application/services/SignalingService";
import { ChatService } from "../application/services/ChatService";
import { LobbyService } from "../application/services/LobbyService";
import { AuthService } from "../application/services/AuthService";
import { RateLimitService } from "../application/services/RateLimitService";
import { SyncCommandBus } from "../application/commands/CommandBus";
import { registerCommandHandlers } from "../application/commands/handlers";
import { buildStrategies } from "../application/strategy/strategies";
import { MessageDispatcher } from "../presentation/ws/dispatcher/MessageDispatcher";
import { ConnectionRegistry } from "../presentation/ws/ConnectionRegistry";
import type { Logger } from "../application/ports/Logger";
import type { SocketSender } from "../domain/entities/Peer";

export const TOKENS = {
  LOGGER: "logger",
  NODE_NAME: "nodeName",
  STARTED_AT: "startedAt",
  REDIS: "redis",
  PRISMA: "prisma",
  METRICS: "metrics",
  ROOM_FACTORY: "roomFactory",
  PEER_FACTORY: "peerFactory",
  LOCK: "lock",
  RATE_LIMITER: "rateLimiter",
  PUB_SUB: "pubSub",
  ROOM_REPOSITORY: "roomRepository",
  USER_REPOSITORY: "userRepository",
  MEETING_REPOSITORY: "meetingRepository",
  CHAT_REPOSITORY: "chatRepository",
  QUEUE: "queue",
  EVENT_BUS: "eventBus",
  ROOM_SERVICE: "roomService",
  PEER_SERVICE: "peerService",
  SIGNALING_SERVICE: "signalingService",
  CHAT_SERVICE: "chatService",
  LOBBY_SERVICE: "lobbyService",
  AUTH_SERVICE: "authService",
  RATE_LIMIT_SERVICE: "rateLimitService",
  JWT_SERVICE: "jwtService",
  TOKEN_BLACKLIST: "tokenBlacklist",
  SESSION_STORE: "sessionStore",
  COMMAND_BUS: "commandBus",
  STRATEGY_REGISTRY: "strategyRegistry",
  DISPATCHER: "dispatcher",
  REGISTRY: "registry",
} as const;

export interface RegisterServicesOptions {
  nodeName: string;
  startedAt: number;
  logger?: PinoLogger;
}

export function createContainer(options: RegisterServicesOptions): Container {
  const container = new Container();
  const { nodeName, startedAt } = options;

  const logger = options.logger ?? new PinoLogger({ level: config.env.LOG_LEVEL });
  container.registerInstance<Logger>(TOKENS.LOGGER, logger);
  container.registerInstance(TOKENS.NODE_NAME, nodeName);
  container.registerInstance(TOKENS.STARTED_AT, startedAt);

  container.register(TOKENS.REDIS, lazy(() => {
    const client = new RedisClient({
      url: config.env.REDIS_URL,
      logger,
      nodeName,
    });
    return client;
  }));

  container.register(TOKENS.PRISMA, lazy(() => {
    return PrismaClientFactory.create({ logger });
  }));

  container.register(TOKENS.METRICS, () => new MetricsService({ nodeName, logger }));

  container.register(TOKENS.ROOM_FACTORY, () => new RoomFactory());
  container.register(TOKENS.PEER_FACTORY, () => new PeerFactory());

  container.register(TOKENS.LOCK, (c) => {
    const redis = c.resolve<RedisClient>(TOKENS.REDIS).client;
    return new RedisLock(redis, logger);
  });

  container.register(TOKENS.RATE_LIMITER, (c) => {
    const redis = c.resolve<RedisClient>(TOKENS.REDIS).client;
    return new RedisRateLimiter(redis, logger);
  });

  container.register(TOKENS.PUB_SUB, () =>
    new RedisPubSub(config.env.REDIS_URL, logger)
  );

  container.register(TOKENS.TOKEN_BLACKLIST, (c) => {
    const redis = c.resolve<RedisClient>(TOKENS.REDIS).client;
    return new RedisTokenBlacklist(redis);
  });

  container.register(TOKENS.SESSION_STORE, (c) => {
    const redis = c.resolve<RedisClient>(TOKENS.REDIS).client;
    return new RedisSessionStore(redis);
  });

  container.register(TOKENS.ROOM_REPOSITORY, (c) => {
    const redis = c.resolve<RedisClient>(TOKENS.REDIS).client;
    const lock = c.resolve<RedisLock>(TOKENS.LOCK);
    const roomFactory = c.resolve<RoomFactory>(TOKENS.ROOM_FACTORY);
    return new RedisRoomRepository({ redis, lock, roomFactory, logger });
  });

  container.register(TOKENS.USER_REPOSITORY, (c) => {
    const prisma = c.resolve<import("@prisma/client").PrismaClient>(TOKENS.PRISMA);
    return new PrismaUserRepository(prisma, logger);
  });

  container.register(TOKENS.MEETING_REPOSITORY, (c) => {
    const prisma = c.resolve<import("@prisma/client").PrismaClient>(TOKENS.PRISMA);
    return new PrismaMeetingRepository(prisma, logger);
  });

  container.register(TOKENS.CHAT_REPOSITORY, (c) => {
    const prisma = c.resolve<import("@prisma/client").PrismaClient>(TOKENS.PRISMA);
    return new PrismaChatRepository(prisma, logger);
  });

  container.register(TOKENS.QUEUE, (c) => {
    const chatRepository = c.resolve<PrismaChatRepository>(TOKENS.CHAT_REPOSITORY);
    return new BullMQQueue({
      connection: { url: config.env.REDIS_URL },
      logger,
      enabled: config.features.queueEnabled,
      processJob: async (jobName, payload) => {
        if (jobName === "chat.persistence") {
          await chatRepository.save(payload as never);
        }
      },
    });
  });

  container.register(TOKENS.EVENT_BUS, () => new EventBus());

  container.register(TOKENS.ROOM_SERVICE, (c) => {
    const roomRepository = c.resolve<RedisRoomRepository>(TOKENS.ROOM_REPOSITORY);
    const roomFactory = c.resolve<RoomFactory>(TOKENS.ROOM_FACTORY);
    const lock = c.resolve<RedisLock>(TOKENS.LOCK);
    const eventBus = c.resolve<EventBus>(TOKENS.EVENT_BUS);
    return new RoomService({ roomRepository, roomFactory, lock, eventBus, logger });
  });

  container.register(TOKENS.PEER_SERVICE, (c) => {
    const roomService = c.resolve<RoomService>(TOKENS.ROOM_SERVICE);
    const eventBus = c.resolve<EventBus>(TOKENS.EVENT_BUS);
    const sessionStore = c.resolve<RedisSessionStore>(TOKENS.SESSION_STORE);
    return new PeerService({ roomService, eventBus, sessionStore, logger });
  });

  container.register(TOKENS.SIGNALING_SERVICE, (c) => {
    const roomService = c.resolve<RoomService>(TOKENS.ROOM_SERVICE);
    return new SignalingService({ roomService, logger });
  });

  container.register(TOKENS.CHAT_SERVICE, (c) => {
    const eventBus = c.resolve<EventBus>(TOKENS.EVENT_BUS);
    const queue = c.resolve<BullMQQueue>(TOKENS.QUEUE);
    return new ChatService({ eventBus, queue, logger });
  });

  container.register(TOKENS.LOBBY_SERVICE, (c) => {
    const eventBus = c.resolve<EventBus>(TOKENS.EVENT_BUS);
    const roomRepository = c.resolve<RedisRoomRepository>(TOKENS.ROOM_REPOSITORY);
    const userRepository = c.resolve<PrismaUserRepository>(TOKENS.USER_REPOSITORY);
    return new LobbyService({ eventBus, roomRepository, userRepository, logger });
  });

  container.register(TOKENS.AUTH_SERVICE, (c) => {
    const jwtService = c.resolve<JwtService>(TOKENS.JWT_SERVICE);
    const tokenBlacklist = c.resolve<RedisTokenBlacklist>(TOKENS.TOKEN_BLACKLIST);
    const sessionStore = c.resolve<RedisSessionStore>(TOKENS.SESSION_STORE);
    return new AuthService({ tokenProvider: jwtService, tokenBlacklist, sessionStore, logger });
  });

  container.register(TOKENS.JWT_SERVICE, () =>
    new JwtService({ secret: config.env.NEXTAUTH_SECRET, logger })
  );

  container.register(TOKENS.RATE_LIMIT_SERVICE, (c) => {
    const rateLimiter = c.resolve<RedisRateLimiter>(TOKENS.RATE_LIMITER);
    return new RateLimitService({ rateLimiter, logger });
  });

  container.register(TOKENS.COMMAND_BUS, (c) => {
    const bus = new SyncCommandBus({ logger });
    registerCommandHandlers(bus, {
      roomService: c.resolve<RoomService>(TOKENS.ROOM_SERVICE),
      peerService: c.resolve<PeerService>(TOKENS.PEER_SERVICE),
      signalingService: c.resolve<SignalingService>(TOKENS.SIGNALING_SERVICE),
      chatService: c.resolve<ChatService>(TOKENS.CHAT_SERVICE),
      lobbyService: c.resolve<LobbyService>(TOKENS.LOBBY_SERVICE),
      peerFactory: c.resolve<PeerFactory>(TOKENS.PEER_FACTORY),
      meetingRepository: c.resolve<PrismaMeetingRepository>(TOKENS.MEETING_REPOSITORY),
      userRepository: c.resolve<PrismaUserRepository>(TOKENS.USER_REPOSITORY),
      logger,
    });
    return bus;
  });

  container.register(TOKENS.STRATEGY_REGISTRY, (c) => {
    const commandBus = c.resolve<SyncCommandBus>(TOKENS.COMMAND_BUS);
    return buildStrategies({ commandBus });
  });

  container.register(TOKENS.DISPATCHER, (c) => {
    const strategyRegistry = c.resolve<ReturnType<typeof buildStrategies>>(TOKENS.STRATEGY_REGISTRY);
    const rateLimitService = c.resolve<RateLimitService>(TOKENS.RATE_LIMIT_SERVICE);
    const metrics = c.get<MetricsService>(TOKENS.METRICS);
    return new MessageDispatcher({ strategyRegistry, rateLimitService, metrics, logger });
  });

  container.register(TOKENS.REGISTRY, () => new ConnectionRegistry(logger));

  return container;
}

export function noopSocketSender(): SocketSender {
  return {
    id: "http",
    send: () => false,
    close: () => undefined,
    readyState: "CLOSED",
    markReplaced: () => undefined,
  };
}
