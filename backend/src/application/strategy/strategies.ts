import type { CommandBus } from "../commands/CommandBus";
import {
  CommandNames,
  JoinRoomCommand,
  GetParticipantsCommand,
  ChatMessageCommand,
  RelaySignalingCommand,
  HeartbeatCommand,
  LeaveRoomCommand,
} from "../commands/commandDefinitions";
import {
  MessageHandlerStrategy,
  MessageContext,
  StrategyRegistry,
} from "./MessageHandlerStrategy";
import type { InboundMessage } from "../dto";
import { AppError, ErrorCode } from "../../domain/errors/AppError";

export interface StrategyDeps {
  commandBus: CommandBus;
}

const NO_ROOM = (ctx: MessageContext): never => {
  throw new AppError(ErrorCode.PEER_NOT_FOUND, "You must join a room first");
};

export function buildStrategies(deps: StrategyDeps): StrategyRegistry {
  const registry = new StrategyRegistry();

  registry.register({
    messageType: "join",
    requiresRoom: false,
    handle: async (ctx, message) => {
      const { roomId } = message as { roomId: string };
      const command: JoinRoomCommand = {
        name: CommandNames.JOIN_ROOM,
        payload: {
          userId: ctx.userId,
          socket: ctx.socket,
          clientIp: ctx.clientIp,
          requestId: ctx.requestId,
          roomId,
        },
      };
      await deps.commandBus.execute(command);
    },
  } satisfies MessageHandlerStrategy);

  registry.register({
    messageType: "getParticipants",
    requiresRoom: true,
    handle: async (ctx) => {
      if (!ctx.roomId) return NO_ROOM(ctx);
      const command: GetParticipantsCommand = {
        name: CommandNames.GET_PARTICIPANTS,
        payload: {
          userId: ctx.userId,
          socket: ctx.socket,
          requestId: ctx.requestId,
          roomId: ctx.roomId,
        },
      };
      await deps.commandBus.execute(command);
    },
  } satisfies MessageHandlerStrategy);

  registry.register({
    messageType: "chatMessage",
    requiresRoom: true,
    handle: async (ctx, message) => {
      if (!ctx.roomId) return NO_ROOM(ctx);
      const { message: text, file } = message as { message: string; file?: unknown };
      const command: ChatMessageCommand = {
        name: CommandNames.CHAT_MESSAGE,
        payload: {
          userId: ctx.userId,
          socket: ctx.socket,
          requestId: ctx.requestId,
          roomId: ctx.roomId,
          message: text,
          file,
        },
      };
      await deps.commandBus.execute(command);
    },
  } satisfies MessageHandlerStrategy);

  const relayStrategy =
    (name: RelaySignalingCommand["name"]): MessageHandlerStrategy => ({
      messageType: mapCommandToWire(name),
      requiresRoom: true,
      handle: async (ctx, message) => {
        if (!ctx.roomId || !ctx.peerId) return NO_ROOM(ctx);
        const { targetPeerId, sdp, candidate } = message as {
          targetPeerId?: string;
          sdp?: unknown;
          candidate?: unknown;
        };
        if (!targetPeerId) {
          throw AppError.validation("targetPeerId is required");
        }
        const command: RelaySignalingCommand = {
          name,
          payload: {
            userId: ctx.userId,
            socket: ctx.socket,
            requestId: ctx.requestId,
            roomId: ctx.roomId,
            peerId: ctx.peerId,
            targetPeerId,
            sdp,
            candidate,
          },
        };
        await deps.commandBus.execute(command);
      },
    });

  registry.register(relayStrategy(CommandNames.RELAY_OFFER));
  registry.register(relayStrategy(CommandNames.RELAY_ANSWER));
  registry.register(relayStrategy(CommandNames.RELAY_ICE_CANDIDATE));
  registry.register(relayStrategy(CommandNames.RELAY_STREAM_UNAVAILABLE));

  registry.register({
    messageType: "ping",
    requiresRoom: false,
    handle: async (ctx) => {
      if (ctx.roomId && ctx.peerId) {
        const command: HeartbeatCommand = {
          name: CommandNames.HEARTBEAT,
          payload: {
            userId: ctx.userId,
            socket: ctx.socket,
            requestId: ctx.requestId,
            roomId: ctx.roomId,
            peerId: ctx.peerId,
          },
        };
        await deps.commandBus.execute(command);
      }
      ctx.socket.send({ type: "pong" });
    },
  } satisfies MessageHandlerStrategy);

  registry.register({
    messageType: "leave",
    requiresRoom: true,
    handle: async (ctx) => {
      if (!ctx.roomId || !ctx.peerId) return;
      const command: LeaveRoomCommand = {
        name: CommandNames.LEAVE_ROOM,
        payload: {
          userId: ctx.userId,
          socket: ctx.socket,
          requestId: ctx.requestId,
          roomId: ctx.roomId,
          peerId: ctx.peerId,
          closeSocket: true,
        },
      };
      await deps.commandBus.execute(command);
    },
  } satisfies MessageHandlerStrategy);

  return registry;
}

function mapCommandToWire(name: RelaySignalingCommand["name"]): string {
  switch (name) {
    case CommandNames.RELAY_OFFER:
      return "offer";
    case CommandNames.RELAY_ANSWER:
      return "answer";
    case CommandNames.RELAY_ICE_CANDIDATE:
      return "ice-candidate";
    case CommandNames.RELAY_STREAM_UNAVAILABLE:
      return "stream-unavailable";
  }
}
