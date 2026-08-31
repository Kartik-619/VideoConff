import type { Command } from "./Command";
import type { SocketSender } from "../../domain/entities/Peer";

export const CommandNames = {
  JOIN_ROOM: "joinRoom",
  LEAVE_ROOM: "leaveRoom",
  GET_PARTICIPANTS: "getParticipants",
  CHAT_MESSAGE: "chatMessage",
  RELAY_OFFER: "relayOffer",
  RELAY_ANSWER: "relayAnswer",
  RELAY_ICE_CANDIDATE: "relayIceCandidate",
  RELAY_STREAM_UNAVAILABLE: "relayStreamUnavailable",
  END_MEETING: "endMeeting",
  START_MEETING: "startMeeting",
  HEARTBEAT: "heartbeat",
} as const;

export interface AuthenticatedContext {
  userId: string;
  socket: SocketSender;
  clientIp?: string;
  requestId?: string;
}

export interface JoinRoomCommand extends Command<AuthenticatedContext, void> {
  name: typeof CommandNames.JOIN_ROOM;
  payload: AuthenticatedContext & { roomId: string };
}

export interface LeaveRoomCommand extends Command<AuthenticatedContext, void> {
  name: typeof CommandNames.LEAVE_ROOM;
  payload: AuthenticatedContext & { roomId: string; peerId?: string; closeSocket?: boolean };
}

export interface GetParticipantsCommand extends Command<AuthenticatedContext, void> {
  name: typeof CommandNames.GET_PARTICIPANTS;
  payload: AuthenticatedContext & { roomId: string };
}

export interface ChatMessageCommand extends Command<AuthenticatedContext, void> {
  name: typeof CommandNames.CHAT_MESSAGE;
  payload: AuthenticatedContext & { roomId: string; message: string; file?: ChatMessageInboundFile };
}

export interface ChatMessageInboundFile {
  filename?: string;
  sizeBytes?: number;
  mimeType?: string;
  url?: string;
}

export interface RelaySignalingCommand
  extends Command<AuthenticatedContext, void> {
  name:
    | typeof CommandNames.RELAY_OFFER
    | typeof CommandNames.RELAY_ANSWER
    | typeof CommandNames.RELAY_ICE_CANDIDATE
    | typeof CommandNames.RELAY_STREAM_UNAVAILABLE;
  payload: AuthenticatedContext & {
    roomId: string;
    peerId: string;
    targetPeerId: string;
    sdp?: unknown;
    candidate?: unknown;
  };
}

export interface EndMeetingCommand extends Command<AuthenticatedContext, void> {
  name: typeof CommandNames.END_MEETING;
  payload: AuthenticatedContext & { roomId: string };
}

export interface StartMeetingCommand extends Command<AuthenticatedContext, void> {
  name: typeof CommandNames.START_MEETING;
  payload: AuthenticatedContext & { roomId: string };
}

export interface HeartbeatCommand extends Command<AuthenticatedContext, void> {
  name: typeof CommandNames.HEARTBEAT;
  payload: AuthenticatedContext & { roomId: string; peerId: string };
}

export type AnyCommand =
  | JoinRoomCommand
  | LeaveRoomCommand
  | GetParticipantsCommand
  | ChatMessageCommand
  | RelaySignalingCommand
  | EndMeetingCommand
  | StartMeetingCommand
  | HeartbeatCommand;
