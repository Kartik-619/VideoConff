import type { RawData } from "ws";
import type { SocketServer, RawConnectionContext } from "../../infrastructure/websocket/SocketServer";
import { SocketConnection } from "../../infrastructure/websocket/SocketConnection";
import type { MessageDispatcher } from "./dispatcher/MessageDispatcher";
import { ConnectionRegistry } from "./ConnectionRegistry";
import type { AuthService } from "../../application/services/AuthService";
import type { RateLimitService } from "../../application/services/RateLimitService";
import type { MetricsService } from "../../infrastructure/metrics/MetricsService";
import type { Logger } from "../../application/ports/Logger";
import type { CommandBus } from "../../application/commands/CommandBus";
import { CommandNames, LeaveRoomCommand } from "../../application/commands/commandDefinitions";
import { EventBus, DomainEventType, DomainEvent } from "../../domain/events/EventBus";
import { config } from "../../config/config";
import type { SocketSender } from "../../domain/entities/Peer";
import { AppError, ErrorCode } from "../../domain/errors/AppError";

export interface WsControllerDeps {
  socketServer: SocketServer;
  dispatcher: MessageDispatcher;
  registry: ConnectionRegistry;
  authService: AuthService;
  rateLimitService: RateLimitService;
  commandBus: CommandBus;
  eventBus: EventBus;
  metrics?: MetricsService;
  logger: Logger;
}

/**
 * WebSocket connection lifecycle controller. Authenticates connections,
 * registers them, dispatches messages and cleans up on close. Subscribes to
 * peer lifecycle domain events to bind/unbind connection state.
 */
export class WsController {
  private readonly unsubscribers: (() => void)[] = [];

  constructor(private readonly deps: WsControllerDeps) {
    this.subscribeToDomainEvents();
  }

  start(): void {
    this.deps.socketServer.onConnection((ctx) => this.handleConnection(ctx));
  }

  private async handleConnection(ctx: RawConnectionContext): Promise<void> {
    const connection = new SocketConnection(ctx.ws, ctx.clientIp, {
      logger: this.deps.logger,
      metrics: this.deps.metrics,
      maxMessageSizeBytes: config.env.WS_MAX_MESSAGE_SIZE_BYTES,
    });
    connection.requestId = ctx.requestId;

    try {
      const ipResult = await this.deps.rateLimitService.checkWsByIp(ctx.clientIp);
      if (!ipResult.allowed) {
        this.deps.metrics?.incrementRateLimited("ws-ip");
        connection.close(1013, "too many connections from this IP");
        return;
      }
    } catch {
      /* fail open on rate limiter errors */
    }

    const token = extractToken(ctx.ws);
    if (!token) {
      connection.logger.warn({}, "ws.auth-no-token");
      connection.close(4401, "unauthorized");
      return;
    }

    let user: { id: string };
    try {
      user = await this.deps.authService.authenticateWsToken(token);
    } catch (err) {
      connection.logger.warn({ error: (err as Error).message }, "ws.auth-rejected");
      connection.close(4401, "unauthorized");
      return;
    }

    connection.userId = user.id;
    this.deps.registry.register(connection);
    this.deps.metrics?.setActivePeers(this.deps.registry.count);

    await this.deps.authService.startSession(
      user.id,
      connection.id,
      config.env.WS_TOKEN_TTL_SECONDS
    );

    this.deps.logger.info({ connectionId: connection.id, userId: user.id }, "ws.connected");

    connection.onMessage((data) => {
      void this.handleRawMessage(connection, data);
    });

    connection.onClose((code) => {
      void this.handleClose(connection, code);
    });

    connection.onError((err) => {
      this.deps.metrics?.incrementWsErrors("transport");
      this.deps.logger.debug(
        { connectionId: connection.id, error: err.message },
        "ws.transport-error"
      );
    });
  }

  private async handleRawMessage(connection: SocketConnection, data: RawData): Promise<void> {
    const raw = data.toString();
    try {
      await this.deps.dispatcher.dispatch(connection, raw);
    } catch (err) {
      this.deps.logger.error(
        { connectionId: connection.id, error: (err as Error).message },
        "ws.dispatch-failed"
      );
    }
  }

  private async handleClose(connection: SocketConnection, code: number): Promise<void> {
    const { userId, roomId, peerId, replaced } = connection;

    if (replaced) {
      connection.logger.debug({}, "ws.close-skipped (replaced)");
      this.deps.registry.unregister(connection);
      this.deps.metrics?.setActivePeers(this.deps.registry.count);
      return;
    }

    if (userId && roomId && peerId) {
      const command: LeaveRoomCommand = {
        name: CommandNames.LEAVE_ROOM,
        payload: {
          userId,
          socket: connection,
          roomId,
          peerId,
          requestId: connection.requestId,
        },
      };
      await this.deps.commandBus.execute(command);
      connection.logger.info({ roomId, peerId, code }, "ws.disconnected");
    }

    if (userId) {
      await this.deps.authService.endSession(userId, connection.id);
    }

    this.deps.registry.unregister(connection);
    this.deps.metrics?.setActivePeers(this.deps.registry.count);
  }

  private subscribeToDomainEvents(): void {
    this.unsubscribers.push(
      this.deps.eventBus.subscribe(DomainEventType.PEER_JOINED, (event) => {
        const e = event as Extract<DomainEvent, { type: typeof DomainEventType.PEER_JOINED }>;
        const peer = e.payload.peer;
        const conn = this.deps.registry.getByConnectionId(peer.socket.id);
        if (conn) {
          this.deps.registry.bind(conn, e.payload.room.id, peer.id);
          conn.joined = true;
          conn.userId = peer.userId;
        }
      }),
      this.deps.eventBus.subscribe(DomainEventType.PEER_LEFT, (event) => {
        const e = event as Extract<DomainEvent, { type: typeof DomainEventType.PEER_LEFT }>;
        const peer = e.payload.peer;
        const conn = this.deps.registry.getByConnectionId(peer.socket.id);
        if (conn) {
          conn.joined = false;
        }
      }),
      this.deps.eventBus.subscribe(DomainEventType.ROOM_ENDED, (event) => {
        const e = event as Extract<DomainEvent, { type: typeof DomainEventType.ROOM_ENDED }>;
        void this.deps.registry.closeRoom(e.payload.room.id);
      })
    );
  }

  dispose(): void {
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers.length = 0;
  }
}

function extractToken(ws: import("ws").WebSocket): string | undefined {
  try {
    const url = (ws as unknown as { url?: string }).url ?? "";
    const search = new URL(url, "http://localhost");
    return search.searchParams.get("token") ?? undefined;
  } catch {
    return undefined;
  }
}
