import type { PrismaClient } from "@prisma/client";
import type { Logger } from "../../../application/ports/Logger";
import type { ChatMessage } from "../../../domain/entities/ChatMessage";

export interface PersistedChatMessage {
  id: string;
  roomId: string;
  userId: string;
  name: string;
  message: string;
  timestamp: number;
  fileMetadata: ChatMessage["fileMetadata"];
}

/**
 * Persists chat messages to the database. Used as the worker for the
 * async chat persistence queue.
 */
export class PrismaChatRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly logger: Logger
  ) {}

  async save(message: PersistedChatMessage): Promise<void> {
    try {
      await this.prisma.chatMessage.create({
        data: {
          id: message.id,
          roomId: message.roomId,
          userId: message.userId,
          name: message.name,
          message: message.message,
          createdAt: new Date(message.timestamp),
          fileMetadata: (message.fileMetadata as unknown as object) ?? undefined,
        },
      });
      this.logger.debug({ id: message.id, roomId: message.roomId }, "chat.persisted");
    } catch (err) {
      this.logger.error(
        { id: message.id, error: (err as Error).message },
        "chat.persist-failed"
      );
      throw err;
    }
  }

  async findRecent(roomId: string, limit = 100): Promise<PersistedChatMessage[]> {
    const rows = await this.prisma.chatMessage.findMany({
      where: { roomId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.reverse().map((row) => ({
      id: row.id,
      roomId: row.roomId,
      userId: row.userId,
      name: row.name,
      message: row.message,
      timestamp: row.createdAt.getTime(),
      fileMetadata: (row.fileMetadata as unknown as ChatMessage["fileMetadata"]) ?? null,
    }));
  }
}
