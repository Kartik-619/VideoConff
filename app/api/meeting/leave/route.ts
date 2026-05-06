export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import jwt from "jsonwebtoken";

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

    // =========================
    //  REDIS CLEANUP
    // =========================

    const participantsKey = `meeting:${meetingId}:participants`;

    const isMember = await redis.sismember(participantsKey, userId);

    if (isMember) {
      await redis.srem(participantsKey, userId);
    }

    // =========================
    //  DB SYNC (HISTORY)
    // =========================

    await prisma.meetingParticipant.updateMany({
      where: {
        meetingId,
        userId,
        leftAt: null,
      },
      data: {
        leftAt: new Date(),
      },
    });

    // =========================
    //  WS NOTIFY (FIXED)
    // =========================

    try {
      const token = jwt.sign(
        { id: userId },
        process.env.NEXTAUTH_SECRET!,
        { expiresIn: "5m" }
      );

      await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/leave`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ meetingId, userId, token }),
      });
    } catch (err) {
      console.error("WS leave notify failed:", err);
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