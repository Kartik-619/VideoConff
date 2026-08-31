export type MeetingStatus = "CREATED" | "LIVE" | "ENDED";

export interface MeetingRecord {
  id: string;
  meetingCode: string;
  hostId: string;
  status: MeetingStatus;
  createdAt: Date;
  endedAt?: Date | null;
}

export interface MeetingRepository {
  findById(meetingId: string): Promise<MeetingRecord | null>;
  findByCode(code: string): Promise<MeetingRecord | null>;
  markStarted(meetingId: string): Promise<void>;
  markEnded(meetingId: string): Promise<void>;
  markParticipantLeft(meetingId: string, userId: string): Promise<void>;
  upsertParticipant(meetingId: string, userId: string): Promise<void>;
}
