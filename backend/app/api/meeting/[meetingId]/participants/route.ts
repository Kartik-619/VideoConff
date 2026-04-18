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
        { error: "Meeting ID required" },
        { status: 400 }
      );
    }

    //  Check meeting exists
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: { id: true },
    });

    if (!meeting) {
      return NextResponse.json(
        { error: "Meeting not found" },
        { status: 404 }
      );
    }

    const participantsKey = `meeting:${meetingId}:participants`;

    //  Get live users from Redis
    const userIds = await redis.smembers(participantsKey);

    if (!userIds.length) {
      return NextResponse.json({ participants: [] });
    }

    //  Fetch user data
    const users = await prisma.user.findMany({
      where: {
        id: { in: userIds },
      },
      select: {
        id: true,
        name: true,
      },
    });

    return NextResponse.json({
      participants: users,
    });

  } catch (error) {
    console.error("PARTICIPANTS ERROR:", error);

    return NextResponse.json(
      { error: "Failed to fetch participants" },
      { status: 500 }
    );
  }
}