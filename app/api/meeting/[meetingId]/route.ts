export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(
  req: Request,
  context: { params: Promise<{ meetingId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

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

    if (meeting.status === "ENDED") {
      return NextResponse.json(
        { error: "Meeting already ended" },
        { status: 400 }
      );
    }
    
    const host = await prisma.user.findUnique({
      where: { id: meeting.hostId },
      select: {
        id: true,
        name: true,
      },
    });

    const waitingIds = await redis.smembers(
    `meeting:${meeting.id}:waiting`
    );

    const waitingUsers = await prisma.user.findMany({
      where: { id: { in: waitingIds } },
      select: { id: true, name: true },
    });

    const participantIds = await redis.smembers(
      `meeting:${meeting.id}:participants`
    );

    const participants = await prisma.user.findMany({
      where: {
        id: { in: participantIds },
      },
      select: {
        id: true,
        name: true,
      },
    });

    return NextResponse.json({
      id: meeting.id,
      meetingCode: meeting.meetingCode,
      status: meeting.status,
      host: host || null,
      participants: participants || [],
      waitingUsers,
    });

  } catch (error) {
    console.error("Get meeting error:", error);

    return NextResponse.json(
      { error: "Failed to fetch meeting" },
      { status: 500 }
    );
  }
}