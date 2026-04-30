export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    const { meetingId } = await req.json();

    if (!meetingId) {
      return NextResponse.json(
        { error: "Meeting ID required" },
        { status: 400 }
      );
    }

    //  Check meeting exists
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
    });

    if (!meeting) {
      return NextResponse.json(
        { error: "Meeting not found" },
        { status: 404 }
      );
    }

    //  Only host can start
    if (meeting.hostId !== userId) {
      return NextResponse.json(
        { error: "Only host can start meeting" },
        { status: 403 }
      );
    }

    //  Prevent duplicate start
    if (meeting.status === "LIVE") {
      return NextResponse.json({
        success: true,
        message: "Already started",
      });
    }

    if (meeting.status === "ENDED") {
      return NextResponse.json(
        { error: "Meeting already ended" },
        { status: 400 }
      );
    }

    // =========================
    //  UPDATE DB
    // =========================

    await prisma.meeting.update({
      where: { id: meetingId },
      data: {
        status: "LIVE",
      },
    });

    // =========================
    //  REDIS SYNC
    // =========================

    const statusKey = `meeting:${meetingId}:status`;

    await redis.set(statusKey, "LIVE");

    // =========================
    //  WS NOTIFY
    // =========================

    try {
      await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/startMeeting`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ meetingId }),
      });
    } catch (err) {
      console.error("WS start notify failed:", err);
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("START ERROR:", error);

    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}