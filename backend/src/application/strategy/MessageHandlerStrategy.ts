import type { InboundMessage } from "../dto";
import type { SocketSender } from "../../domain/entities/Peer";

export interface MessageContext {
  userId: string;
  socket: SocketSender;
  clientIp?: string;
  requestId?: string;
  roomId?: string;
  peerId?: string;
}

/**
 * Strategy interface (Strategy pattern). Each inbound WebSocket message type
 * maps to a strategy that knows how to handle it.
 */
export interface MessageHandlerStrategy {
  readonly messageType: string;
  readonly requiresRoom: boolean;
  handle(ctx: MessageContext, message: InboundMessage): Promise<void>;
}

/**
 * Registry that maps inbound message types to their handler strategies.
 */
export class StrategyRegistry {
  private readonly strategies = new Map<string, MessageHandlerStrategy>();

  register(strategy: MessageHandlerStrategy): void {
    if (this.strategies.has(strategy.messageType)) {
      throw new Error(`Duplicate strategy for message type '${strategy.messageType}'`);
    }
    this.strategies.set(strategy.messageType, strategy);
  }

  get(messageType: string): MessageHandlerStrategy | undefined {
    return this.strategies.get(messageType);
  }

  has(messageType: string): boolean {
    return this.strategies.has(messageType);
  }
}
