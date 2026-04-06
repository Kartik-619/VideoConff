export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

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

    //  Only host can end
    if (meeting.hostId !== userId) {
      return NextResponse.json(
        { error: "Only host can end meeting" },
        { status: 403 }
      );
    }

    //  Prevent duplicate end
    if (meeting.status === "ENDED") {
      return NextResponse.json({
        success: true,
        message: "Already ended",
      });
    }

    // =========================
    //  UPDATE DB
    // =========================

    await prisma.meeting.update({
      where: { id: meetingId },
      data: {
        status: "ENDED",
        endedAt: new Date(),
      },
    });

    // =========================
    //  REDIS CLEANUP (FULL)
    // =========================

    const participantsKey = `meeting:${meetingId}:participants`;
    const hostKey = `meeting:${meetingId}:host`;
    const statusKey = `meeting:${meetingId}:status`;

    await redis.del(
      participantsKey,
      hostKey,
      statusKey
    );

    // =========================
    //  WS NOTIFY
    // =========================

    try {
      await fetch("http://localhost:8080/endMeeting", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ meetingId }),
      });
    } catch (err) {
      console.error("WS end notify failed:", err);
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("END ERROR:", error);

    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}