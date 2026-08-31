import type { Room } from "../../domain/entities/Room";
import type { Peer } from "../../domain/entities/Peer";
import type { RoomService } from "./RoomService";
import type { Logger } from "../ports/Logger";
import { AppError, ErrorCode } from "../../domain/errors/AppError";

export type SignalingMessageType =
  | "offer"
  | "answer"
  | "ice-candidate"
  | "stream-unavailable";

export interface SignalingStats {
  offers: number;
  answers: number;
  iceCandidates: number;
  streamUnavailable: number;
  rejected: number;
}

const MAX_SDP_LENGTH = 64 * 1024;
const MAX_CANDIDATE_LENGTH = 4096;

/**
 * SDP validation per RFC 4566. Enforces structure and size limits to prevent
 * oversized / malformed payloads from being relayed.
 */
export function validateSdp(sdp: unknown): { sdp: string; type: "offer" | "answer" } {
  if (typeof sdp !== "object" || sdp === null) {
    throw AppError.validation("Invalid SDP payload");
  }
  const { sdp: body, type } = sdp as { sdp?: unknown; type?: unknown };

  if (typeof body !== "string" || body.length === 0 || body.length > MAX_SDP_LENGTH) {
    throw AppError.validation("SDP body must be a non-empty string");
  }
  if (!body.startsWith("v=0")) {
    throw AppError.validation("SDP body must start with a v=0 session description line");
  }
  const lineCount = body.split(/\r?\n/).length;
  if (lineCount > 1000) {
    throw AppError.validation("SDP body has too many lines");
  }

  if (type !== "offer" && type !== "answer") {
    throw AppError.validation("SDP type must be 'offer' or 'answer'");
  }
  return { sdp: body, type };
}

/**
 * ICE candidate validation. Accepts real candidates (candidate:...) and the
 * empty-string end-of-candidates marker, while rejecting oversized or
 * non-conforming payloads.
 */
export function validateIceCandidate(candidate: unknown): unknown {
  if (typeof candidate !== "object" || candidate === null) {
    throw AppError.validation("Invalid ICE candidate");
  }
  const { candidate: c, sdpMid, sdpMLineIndex } = candidate as {
    candidate?: unknown;
    sdpMid?: unknown;
    sdpMLineIndex?: unknown;
  };

  if (typeof c !== "string" || c.length > MAX_CANDIDATE_LENGTH) {
    throw AppError.validation("ICE candidate must be a string");
  }
  if (c !== "" && !c.startsWith("candidate:")) {
    throw AppError.validation("Malformed ICE candidate");
  }
  if (sdpMid !== undefined && typeof sdpMid !== "string") {
    throw AppError.validation("sdpMid must be a string");
  }
  if (sdpMLineIndex !== undefined && typeof sdpMLineIndex !== "number") {
    throw AppError.validation("sdpMLineIndex must be a number");
  }
  return candidate;
}

export interface SignalingServiceDeps {
  roomService: RoomService;
  logger: Logger;
}

/**
 * WebRTC signaling relay service. Validates SDP/ICE payloads before relaying
 * and tracks signaling statistics. Designed so an SFU/simulcast path can be
 * added later by extending the relay strategy.
 */
export class SignalingService {
  private readonly stats = new Map<string, SignalingStats>();

  constructor(private readonly deps: SignalingServiceDeps) {}

  getStats(roomId: string): SignalingStats {
    return (
      this.stats.get(roomId) ?? {
        offers: 0,
        answers: 0,
        iceCandidates: 0,
        streamUnavailable: 0,
        rejected: 0,
      }
    );
  }

  private bump(roomId: string, field: keyof SignalingStats): void {
    const current = this.getStats(roomId);
    current[field] += 1;
    this.stats.set(roomId, current);
  }

  /**
   * Relays a signaling message from the sender to a target peer within the
   * same room, after validating that both peers exist and the payload is
   * well-formed.
   */
  async relay(
    roomId: string,
    type: SignalingMessageType,
    sender: Peer,
    targetPeerId: string,
    payload: { sdp?: unknown; candidate?: unknown }
  ): Promise<void> {
    const room = await this.deps.roomService.getRoom(roomId);
    if (!room) {
      throw new AppError(ErrorCode.ROOM_NOT_FOUND, `Room ${roomId} not found`);
    }

    const target = room.getPeer(targetPeerId);
    if (!target) {
      this.bump(roomId, "rejected");
      throw new AppError(ErrorCode.PEER_NOT_FOUND, `Target peer ${targetPeerId} not found`);
    }

    switch (type) {
      case "offer":
      case "answer": {
        const validated = validateSdp(payload.sdp);
        this.bump(roomId, type === "offer" ? "offers" : "answers");
        target.socket.send({
          type,
          sdp: validated,
          senderPeerId: sender.id,
          senderName: sender.name,
        });
        break;
      }
      case "ice-candidate": {
        const candidate = validateIceCandidate(payload.candidate);
        this.bump(roomId, "iceCandidates");
        target.socket.send({
          type,
          candidate,
          senderPeerId: sender.id,
        });
        break;
      }
      case "stream-unavailable": {
        this.bump(roomId, "streamUnavailable");
        target.socket.send({
          type,
          senderPeerId: sender.id,
        });
        break;
      }
    }
  }
}
