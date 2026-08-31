import type { Room } from "../../domain/entities/Room";
import { ChatMessage } from "../../domain/entities/ChatMessage";
import type { Peer } from "../../domain/entities/Peer";
import { EventBus, DomainEventType } from "../../domain/events/EventBus";
import type { MessageQueuePort } from "../ports/MessageQueue";
import type { Logger } from "../ports/Logger";
import { AppError, ErrorCode } from "../../domain/errors/AppError";

export type ModerationResult = { allowed: boolean; sanitized: string; reason?: string };
export type ModerationHook = (input: {
  userId: string;
  roomId: string;
  message: string;
}) => Promise<ModerationResult> | ModerationResult;

const MAX_CHAT_MESSAGE_LENGTH = 4000;

export interface ChatServiceDeps {
  eventBus: EventBus;
  queue: MessageQueuePort;
  logger: Logger;
  moderationHook?: ModerationHook;
}

/**
 * Chat service, separated from signaling. Validates and sanitizes messages,
 * runs moderation hooks, broadcasts to the room and asynchronously persists
 * history through the message queue.
 */
export class ChatService {
  private readonly moderationHook?: ModerationHook;

  constructor(private readonly deps: ChatServiceDeps) {
    this.moderationHook = deps.moderationHook;
  }

  async handleChatMessage(room: Room, peer: Peer, message: string, file?: unknown): Promise<ChatMessage> {
    const trimmed = message.trim();
    if (!trimmed) {
      throw AppError.validation("Message cannot be empty");
    }
    if (trimmed.length > MAX_CHAT_MESSAGE_LENGTH) {
      throw AppError.validation(`Message exceeds ${MAX_CHAT_MESSAGE_LENGTH} characters`);
    }

    let finalMessage = sanitizeText(trimmed);
    if (this.moderationHook) {
      const result = await this.moderationHook({
        userId: peer.userId,
        roomId: room.id,
        message: finalMessage,
      });
      if (!result.allowed) {
        throw new AppError(
          ErrorCode.FORBIDDEN,
          result.reason ?? "Message rejected by moderation"
        );
      }
      finalMessage = result.sanitized;
    }

    const chatMessage = new ChatMessage({
      roomId: room.id,
      userId: peer.userId,
      name: peer.name,
      message: finalMessage,
      fileMetadata: validateFileMetadata(file),
    });

    const wire = {
      type: "chatMessage",
      data: chatMessage.toWireFormat(),
    };

    for (const other of room.activePeers) {
      other.socket.send(wire);
    }

    void this.deps.eventBus.emit({
      type: DomainEventType.CHAT_MESSAGE,
      payload: { room, message: chatMessage },
    });

    if (this.deps.queue.isEnabled()) {
      await this.deps.queue.add(
        "chat.persistence",
        {
          id: chatMessage.id,
          roomId: chatMessage.roomId,
          userId: chatMessage.userId,
          name: chatMessage.name,
          message: chatMessage.message,
          timestamp: chatMessage.timestamp,
          fileMetadata: chatMessage.fileMetadata,
        },
        { attempts: 5, backoffMs: 1000, backoffType: "exponential" }
      );
    }

    return chatMessage;
  }

  broadcastTyping(room: Room, peer: Peer, isTyping: boolean): void {
    const wire = { type: "typing", userId: peer.userId, name: peer.name, isTyping };
    for (const other of room.activePeers) {
      if (other.id !== peer.id) {
        other.socket.send(wire);
      }
    }
  }
}

interface ChatSender {
  userId: string;
  name: string;
}

function validateFileMetadata(file: unknown): ChatMessage["fileMetadata"] {
  if (file === undefined || file === null) return null;
  if (typeof file !== "object") throw AppError.validation("Invalid file metadata");
  const f = file as { filename?: unknown; sizeBytes?: unknown; mimeType?: unknown; url?: unknown };
  if (f.filename !== undefined && typeof f.filename !== "string") {
    throw AppError.validation("filename must be a string");
  }
  if (f.sizeBytes !== undefined && (typeof f.sizeBytes !== "number" || f.sizeBytes < 0)) {
    throw AppError.validation("sizeBytes must be a non-negative number");
  }
  if (f.mimeType !== undefined && typeof f.mimeType !== "string") {
    throw AppError.validation("mimeType must be a string");
  }
  if (f.url !== undefined && typeof f.url !== "string") {
    throw AppError.validation("url must be a string");
  }
  return {
    filename: f.filename as string | undefined,
    sizeBytes: f.sizeBytes as number | undefined,
    mimeType: f.mimeType as string | undefined,
    url: f.url as string | undefined,
  };
}

/** Strips control characters / HTML to keep messages safe for the UI. */
export function sanitizeText(input: string): string {
  return input
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
