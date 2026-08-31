import type { ChatMessage } from "../../domain/entities/ChatMessage";

export type InboundMessageType =
  | "join"
  | "getParticipants"
  | "chatMessage"
  | "offer"
  | "answer"
  | "ice-candidate"
  | "stream-unavailable"
  | "ping";

export interface JoinMessage {
  type: "join";
  roomId: string;
}

export interface GetParticipantsMessage {
  type: "getParticipants";
}

export interface ChatMessageInbound {
  type: "chatMessage";
  message: string;
  file?: {
    filename?: string;
    sizeBytes?: number;
    mimeType?: string;
    url?: string;
  };
}

export interface OfferMessage {
  type: "offer";
  targetPeerId: string;
  sdp: unknown;
}

export interface AnswerMessage {
  type: "answer";
  targetPeerId: string;
  sdp: unknown;
}

export interface IceCandidateMessage {
  type: "ice-candidate";
  targetPeerId: string;
  candidate: unknown;
}

export interface StreamUnavailableMessage {
  type: "stream-unavailable";
  targetPeerId: string;
}

export interface PingMessage {
  type: "ping";
}

export type InboundMessage =
  | JoinMessage
  | GetParticipantsMessage
  | ChatMessageInbound
  | OfferMessage
  | AnswerMessage
  | IceCandidateMessage
  | StreamUnavailableMessage
  | PingMessage;

export interface PeerJoinDto {
  peerId: string;
  name: string;
  userId: string;
}

export interface OutboundMessage {
  type: string;
  [key: string]: unknown;
}

export interface ErrorOutboundMessage extends OutboundMessage {
  type: "error";
  code: string;
  message: string;
  retryable: boolean;
  requestId?: string;
}

export interface JoinedOutboundMessage extends OutboundMessage {
  type: "joined";
  peerId: string;
  hostId: string | null;
}

export interface ExistingPeersOutboundMessage extends OutboundMessage {
  type: "existingPeers";
  peers: PeerJoinDto[];
}

export interface PeerJoinedOutboundMessage extends OutboundMessage {
  type: "peerJoined";
  senderPeerId: string;
  name: string;
  userId: string;
}

export interface PeerLeftOutboundMessage extends OutboundMessage {
  type: "peerLeft";
  senderPeerId: string;
}

export interface LobbyUpdateOutboundMessage extends OutboundMessage {
  type: "lobbyUpdate";
  participants: { id: string; name: string }[];
}

export interface ChatMessageOutboundMessage extends OutboundMessage {
  type: "chatMessage";
  data: ChatMessage["toWireFormat"] extends () => infer R ? R : never;
}
