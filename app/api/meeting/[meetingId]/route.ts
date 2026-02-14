export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

export async function GET(
  req: Request,
  context: { params: Promise<{ meetingId: string }> }
) {
  try {
    const { meetingId } = await context.params;

    if (!meetingId) {
      return NextResponse.json(
        { error: "Meeting ID missing" },
        { status: 400 }
      );
    }

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: {
        id: true,
        meetingCode: true,
        hostId: true,
        status: true,
      },
    });

    if (!meeting) {
      return NextResponse.json(
        { error: "Meeting not found" },
        { status: 404 }
      );
    }

    const participantIds = await redis.smembers(
      `meeting:${meeting.id}:participants`
    );

    const users = await prisma.user.findMany({
      where: {
        id: { in: participantIds },
      },
      select: {
        id: true,
        name: true,
      },
    });

    const host = users.find(
      (user) => user.id === meeting.hostId
    );

    const participants = users.filter(
      (user) => user.id !== meeting.hostId
    );

    return NextResponse.json({
      id: meeting.id,
      meetingCode: meeting.meetingCode,
      status: meeting.status,
      host: host || null,
      participants: participants || [],
    });

  } catch (error) {
    console.error("Get meeting error:", error);

    return NextResponse.json(
      { error: "Failed to fetch meeting" },
      { status: 500 }
    );
  }
}
