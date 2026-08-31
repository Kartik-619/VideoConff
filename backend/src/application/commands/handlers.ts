import type { CommandBus } from "./CommandBus";
import {
  CommandNames,
  JoinRoomCommand,
  LeaveRoomCommand,
  GetParticipantsCommand,
  ChatMessageCommand,
  RelaySignalingCommand,
  EndMeetingCommand,
  StartMeetingCommand,
  HeartbeatCommand,
} from "./commandDefinitions";
import type { RoomService } from "../services/RoomService";
import type { PeerService } from "../services/PeerService";
import type { SignalingService } from "../services/SignalingService";
import type { ChatService } from "../services/ChatService";
import type { LobbyService } from "../services/LobbyService";
import type { PeerFactory } from "../../domain/factories/PeerFactory";
import type { MeetingRepository } from "../ports/MeetingRepository";
import type { UserRepository } from "../ports/UserRepository";
import type { Logger } from "../ports/Logger";
import { AppError, ErrorCode } from "../../domain/errors/AppError";
import type { Peer } from "../../domain/entities/Peer";

export interface CommandHandlerContext {
  roomService: RoomService;
  peerService: PeerService;
  signalingService: SignalingService;
  chatService: ChatService;
  lobbyService: LobbyService;
  peerFactory: PeerFactory;
  meetingRepository: MeetingRepository;
  userRepository: UserRepository;
  logger: Logger;
}

/**
 * Registers every command handler on the command bus (use case layer).
 */
export function registerCommandHandlers(
  bus: CommandBus,
  ctx: CommandHandlerContext
): void {
  bus.register(CommandNames.JOIN_ROOM, {
    handle: (cmd: JoinRoomCommand) => handleJoinRoom(ctx, cmd),
  });
  bus.register(CommandNames.LEAVE_ROOM, {
    handle: (cmd: LeaveRoomCommand) => handleLeaveRoom(ctx, cmd),
  });
  bus.register(CommandNames.GET_PARTICIPANTS, {
    handle: (cmd: GetParticipantsCommand) => handleGetParticipants(ctx, cmd),
  });
  bus.register(CommandNames.CHAT_MESSAGE, {
    handle: (cmd: ChatMessageCommand) => handleChatMessage(ctx, cmd),
  });
  bus.register(CommandNames.RELAY_OFFER, {
    handle: (cmd: RelaySignalingCommand) => handleRelaySignaling(ctx, cmd),
  });
  bus.register(CommandNames.RELAY_ANSWER, {
    handle: (cmd: RelaySignalingCommand) => handleRelaySignaling(ctx, cmd),
  });
  bus.register(CommandNames.RELAY_ICE_CANDIDATE, {
    handle: (cmd: RelaySignalingCommand) => handleRelaySignaling(ctx, cmd),
  });
  bus.register(CommandNames.RELAY_STREAM_UNAVAILABLE, {
    handle: (cmd: RelaySignalingCommand) => handleRelaySignaling(ctx, cmd),
  });
  bus.register(CommandNames.END_MEETING, {
    handle: (cmd: EndMeetingCommand) => handleEndMeeting(ctx, cmd),
  });
  bus.register(CommandNames.START_MEETING, {
    handle: (cmd: StartMeetingCommand) => handleStartMeeting(ctx, cmd),
  });
  bus.register(CommandNames.HEARTBEAT, {
    handle: (cmd: HeartbeatCommand) => handleHeartbeat(ctx, cmd),
  });
}

async function handleJoinRoom(ctx: CommandHandlerContext, cmd: JoinRoomCommand): Promise<void> {
  const { roomId, userId, socket, clientIp } = cmd.payload;

  const room = await ctx.roomService.getOrCreateRoom(roomId);

  if (!room.hostId || room.hostId === userId) {
    room.setHost(userId);
  }
  if (room.hostId && room.hostId !== userId && room.isEmpty) {
    room.setHost(userId);
  }

  const peer = ctx.peerFactory.create({
    userId,
    name: "",
    socket,
    clientIp,
    role: room.hostId === userId ? "HOST" : "PARTICIPANT",
  });

  await applyUserName(ctx, userId, peer);

  const { replacedPeerId } = await ctx.peerService.joinRoom(room, peer);
  ctx.peerService.startHeartbeatSweep(room.id);

  if (replacedPeerId) {
    const replaceNotice = { type: "peerLeft", senderPeerId: replacedPeerId };
    for (const other of room.activePeers) {
      if (other.id !== peer.id) other.socket.send(replaceNotice);
    }
  }

  socket.send({
    type: "joined",
    peerId: peer.id,
    hostId: room.hostId,
  });

  const existingPeers = room.activePeers
    .filter((p) => p.id !== peer.id)
    .map((p) => ({ peerId: p.id, name: p.name, userId: p.userId }));
  if (existingPeers.length > 0) {
    socket.send({ type: "existingPeers", peers: existingPeers });
  }

  const joinNotice = {
    type: "peerJoined",
    senderPeerId: peer.id,
    name: peer.name,
    userId,
  };
  for (const other of room.activePeers) {
    if (other.id !== peer.id) other.socket.send(joinNotice);
  }

  ctx.logger.info(
    { roomId, userId, peerId: peer.id, peers: room.peerCount },
    "peer.joined"
  );
}

async function handleLeaveRoom(ctx: CommandHandlerContext, cmd: LeaveRoomCommand): Promise<void> {
  const { roomId, peerId, userId, socket, closeSocket } = cmd.payload;
  const room = await ctx.roomService.getRoom(roomId);
  if (!room) return;

  const peersToRemove = room.activePeers.filter((p) => p.userId === userId);
  for (const peer of peersToRemove) {
    await ctx.peerService.leaveRoom(room, peer.id);
    if (closeSocket) peer.socket.close(1000, "left room");
  }
  void socket;
}

async function handleGetParticipants(
  ctx: CommandHandlerContext,
  cmd: GetParticipantsCommand
): Promise<void> {
  const { roomId, socket } = cmd.payload;
  const participants = await ctx.lobbyService.getParticipants(roomId);
  socket.send({ type: "lobbyUpdate", participants });
}

async function handleChatMessage(ctx: CommandHandlerContext, cmd: ChatMessageCommand): Promise<void> {
  const { roomId, userId, message, file } = cmd.payload;
  const room = await ctx.roomService.requireRoom(roomId);
  const peer = room.findPeerByUserId(userId);
  if (!peer) throw new AppError(ErrorCode.PEER_NOT_FOUND, "Not a member of this room");
  await ctx.chatService.handleChatMessage(room, peer, message, file);
}

async function handleRelaySignaling(ctx: CommandHandlerContext, cmd: RelaySignalingCommand): Promise<void> {
  const { roomId, peerId, targetPeerId, sdp, candidate, userId, socket } = cmd.payload;
  const room = await ctx.roomService.requireRoom(roomId);
  const sender = room.getPeer(peerId);
  if (!sender || sender.userId !== userId) {
    throw new AppError(ErrorCode.PEER_NOT_FOUND, "Sender is not a member of this room");
  }
  const type = cmd.name as
    | "offer"
    | "answer"
    | "ice-candidate"
    | "stream-unavailable";
  await ctx.signalingService.relay(roomId, type, sender, targetPeerId, { sdp, candidate });
  void socket;
}

async function handleEndMeeting(ctx: CommandHandlerContext, cmd: EndMeetingCommand): Promise<void> {
  const { roomId } = cmd.payload;
  const room = await ctx.roomService.getRoom(roomId);
  if (room) {
    for (const peer of room.activePeers) {
      peer.socket.send({ type: "meetingEnded" });
      peer.socket.close(1000, "meeting ended");
    }
  }
  await ctx.roomService.endRoom(roomId);
  await ctx.meetingRepository.markEnded(roomId);
}

async function handleStartMeeting(ctx: CommandHandlerContext, cmd: StartMeetingCommand): Promise<void> {
  const { roomId } = cmd.payload;
  const room = await ctx.roomService.getRoom(roomId);
  if (room) {
    for (const peer of room.activePeers) {
      peer.socket.send({ type: "meetingStarted" });
    }
  }
  await ctx.roomService.startRoom(roomId);
  await ctx.meetingRepository.markStarted(roomId);
}

async function handleHeartbeat(ctx: CommandHandlerContext, cmd: HeartbeatCommand): Promise<void> {
  const { roomId, peerId } = cmd.payload;
  const room = await ctx.roomService.getRoom(roomId);
  if (!room) return;
  await ctx.peerService.heartbeat(room, peerId);
}

async function applyUserName(
  ctx: CommandHandlerContext,
  userId: string,
  peer: Peer
): Promise<void> {
  try {
    const user = await ctx.userRepository.findById(userId);
    if (user) peer.rename(user.name);
  } catch (err) {
    ctx.logger.warn({ userId, error: (err as Error).message }, "user.name lookup failed");
  }
}
