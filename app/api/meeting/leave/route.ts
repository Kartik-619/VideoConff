export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {

    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { meetingId } = await req.json();

    if (!meetingId) {
      return NextResponse.json(
        { error: "Meeting ID required" },
        { status: 400 }
      );
    }

    // Check meeting exists
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
    });

    if (!meeting) {
      return NextResponse.json(
        { error: "Meeting not found" },
        { status: 404 }
      );
    }

    // Remove participant
    await redis.srem(
      `meeting:${meetingId}:participants`,
      session.user.id
    );

    // Optional: if host leaves → end meeting
    if (meeting.hostId === session.user.id) {

      await prisma.meeting.update({
        where: { id: meetingId },
        data: { status: "ENDED" },
      });

      await redis.del(`meeting:${meetingId}:participants`);
    }

    return NextResponse.json({ success: true });

  } catch (error) {

    console.error("LEAVE ERROR:", error);

    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );

  }
}