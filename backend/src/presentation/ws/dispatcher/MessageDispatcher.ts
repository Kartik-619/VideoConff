import type { SocketConnection } from "../../infrastructure/websocket/SocketConnection";
import type { StrategyRegistry } from "../../application/strategy/MessageHandlerStrategy";
import type { RateLimitService } from "../../application/services/RateLimitService";
import type { MetricsService } from "../../infrastructure/metrics/MetricsService";
import type { Logger } from "../../application/ports/Logger";
import { AppError, ErrorCode } from "../../domain/errors/AppError";
import { inboundSchema } from "../validators/schemas";
import type { InboundMessage } from "../../application/dto";

export interface MessageDispatcherDeps {
  strategyRegistry: StrategyRegistry;
  rateLimitService: RateLimitService;
  metrics?: MetricsService;
  logger: Logger;
}

/**
 * Routes inbound WebSocket messages: parses, schema-validates, rate limits,
 * looks up the matching handler strategy and executes it. Errors are mapped
 * to structured error messages sent back over the socket.
 */
export class MessageDispatcher {
  constructor(private readonly deps: MessageDispatcherDeps) {}

  async dispatch(connection: SocketConnection, raw: string): Promise<void> {
    const startedAt = performance.now();
    connection.touch();

    if (raw.length > connection.maxMessageSizeBytes) {
      this.reject(connection, "MESSAGE_TOO_LARGE", "Message too large");
      return;
    }

    let message: InboundMessage;
    try {
      message = JSON.parse(raw) as InboundMessage;
    } catch {
      this.deps.metrics?.incrementWsErrors("parse");
      this.reject(connection, "VALIDATION", "Malformed JSON");
      return;
    }

    this.deps.metrics?.incrementWsMessages((message as { type?: string }).type ?? "unknown");

    const parsed = inboundSchema.safeParse(message);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      this.deps.metrics?.incrementWsErrors("validation");
      this.reject(
        connection,
        "VALIDATION",
        first ? `${first.path.join(".")}: ${first.message}` : "Invalid message"
      );
      return;
    }

    const valid = parsed.data;
    const messageType = valid.type;

    if (connection.userId) {
      try {
        const userResult = await this.deps.rateLimitService.checkWsByUser(connection.userId);
        if (!userResult.allowed) {
          this.deps.metrics?.incrementRateLimited("ws-user");
          await this.deps.rateLimitService.reportViolation(`ws-user:${connection.userId}`);
          this.reject(connection, "RATE_LIMITED", "Too many messages", { retryAfterMs: userResult.retryAfterMs });
          return;
        }
      } catch {
        /* fail open */
      }
    }

    const strategy = this.deps.strategyRegistry.get(messageType);
    if (!strategy) {
      this.reject(connection, "UNKNOWN_TYPE", `Unsupported message type '${messageType}'`);
      return;
    }

    if (strategy.requiresRoom && !connection.joined) {
      this.reject(connection, "NOT_JOINED", "You must join a room first");
      return;
    }

    try {
      await strategy.handle(
        {
          userId: connection.userId!,
          socket: connection,
          clientIp: connection.clientIp,
          requestId: connection.requestId,
          roomId: connection.roomId,
          peerId: connection.peerId,
        },
        valid as InboundMessage
      );
      this.deps.metrics?.observeMessageLatency(messageType, performance.now() - startedAt);
    } catch (err) {
      this.handleStrategyError(connection, messageType, err);
    }
  }

  private handleStrategyError(connection: SocketConnection, messageType: string, err: unknown): void {
    this.deps.metrics?.incrementWsErrors("handler");
    if (err instanceof AppError) {
      if (err.code === ErrorCode.RATE_LIMITED) {
        this.deps.metrics?.incrementRateLimited("ws-room");
      }
      this.deps.logger.debug(
        { connectionId: connection.id, messageType, code: err.code, message: err.message },
        "ws.message-rejected"
      );
      connection.send({
        type: "error",
        code: err.code,
        message: err.message,
        retryable: err.retryable,
        requestId: connection.requestId,
      });
      return;
    }
    this.deps.logger.error(
      { connectionId: connection.id, messageType, error: (err as Error).message },
      "ws.unhandled-error"
    );
    connection.send({
      type: "error",
      code: "INTERNAL",
      message: "Internal server error",
      retryable: true,
      requestId: connection.requestId,
    });
  }

  private reject(connection: SocketConnection, code: string, message: string, details?: unknown): void {
    this.deps.logger.debug(
      { connectionId: connection.id, code, message },
      "ws.message-rejected"
    );
    connection.send({
      type: "error",
      code,
      message,
      retryable: false,
      requestId: connection.requestId,
      ...(details ? { details } : {}),
    });
  }
}
