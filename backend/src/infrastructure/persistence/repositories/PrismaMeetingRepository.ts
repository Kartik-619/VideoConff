import type { PrismaClient } from "@prisma/client";
import type {
  MeetingRepository,
  MeetingRecord,
} from "../../../application/ports/MeetingRepository";
import type { Logger } from "../../../application/ports/Logger";

/**
 * Prisma-backed meeting repository. Writes that must be durable (status
 * transitions) run inside transactions so partial failures cannot corrupt
 * meeting state.
 */
export class PrismaMeetingRepository implements MeetingRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly logger: Logger
  ) {}

  async findById(meetingId: string): Promise<MeetingRecord | null> {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
    });
    if (!meeting) return null;
    return toRecord(meeting);
  }

  async findByCode(code: string): Promise<MeetingRecord | null> {
    const meeting = await this.prisma.meeting.findUnique({
      where: { meetingCode: code },
    });
    if (!meeting) return null;
    return toRecord(meeting);
  }

  async markStarted(meetingId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.meeting.update({
        where: { id: meetingId },
        data: { status: "LIVE", endedAt: null },
      }),
    ]);
    this.logger.info({ meetingId }, "meeting.marked-started");
  }

  async markEnded(meetingId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.meeting.update({
        where: { id: meetingId },
        data: { status: "ENDED", endedAt: new Date() },
      }),
      this.prisma.meetingParticipant.updateMany({
        where: { meetingId, leftAt: null },
        data: { leftAt: new Date() },
      }),
    ]);
    this.logger.info({ meetingId }, "meeting.marked-ended");
  }

  async markParticipantLeft(meetingId: string, userId: string): Promise<void> {
    await this.prisma.meetingParticipant.updateMany({
      where: { meetingId, userId, leftAt: null },
      data: { leftAt: new Date() },
    });
  }

  async upsertParticipant(meetingId: string, userId: string): Promise<void> {
    const existing = await this.prisma.meetingParticipant.findUnique({
      where: { meetingId_userId: { meetingId, userId } },
    });
    if (existing && !existing.leftAt) return;

    await this.prisma.meetingParticipant.upsert({
      where: { meetingId_userId: { meetingId, userId } },
      update: { leftAt: null, joinedAt: new Date() },
      create: { meetingId, userId, role: "PARTICIPANT" },
    });
  }
}

function toRecord(
  meeting: {
    id: string;
    meetingCode: string;
    hostId: string;
    status: "CREATED" | "LIVE" | "ENDED";
    createdAt: Date;
    endedAt: Date | null;
  }
): MeetingRecord {
  return {
    id: meeting.id,
    meetingCode: meeting.meetingCode,
    hostId: meeting.hostId,
    status: meeting.status,
    createdAt: meeting.createdAt,
    endedAt: meeting.endedAt,
  };
}
