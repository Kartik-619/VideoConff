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

    //  Ensure meeting exists
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

    const count = await redis.scard(participantsKey);

    return NextResponse.json({ count });

  } catch (error) {
    console.error("COUNT ERROR:", error);

    return NextResponse.json(
      { error: "Failed to get participant count" },
      { status: 500 }
    );
  }
}