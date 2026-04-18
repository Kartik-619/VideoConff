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

    const statusKey = `meeting:${meetingId}:status`;

    //  Try Redis first
    const redisStatus = await redis.get(statusKey);

    if (redisStatus) {
      return NextResponse.json({ status: redisStatus });
    }

    //  fallback DB
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: { status: true },
    });

    if (!meeting) {
      return NextResponse.json(
        { error: "Meeting not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      status: meeting.status,
    });

  } catch (error) {
    console.error("STATUS ERROR:", error);

    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}