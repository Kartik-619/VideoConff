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

    const { meetingCode } = await req.json();

    if (!meetingCode) {
      return NextResponse.json(
        { error: "Meeting code required" },
        { status: 400 }
      );
    }

    const normalizedCode = meetingCode.trim().toUpperCase();

    if (normalizedCode.length !== 6) {
      return NextResponse.json(
        { error: "Invalid meeting code format" },
        { status: 400 }
      );
    }

    //  Find meeting
    const meeting = await prisma.meeting.findUnique({
      where: { meetingCode: normalizedCode },
    });

    if (!meeting) {
      return NextResponse.json(
        { error: "Invalid meeting code" },
        { status: 404 }
      );
    }

    if (meeting.status === "ENDED") {
      return NextResponse.json(
        { error: "Meeting already ended" },
        { status: 400 }
      );
    }

    // =========================
    //  REDIS DESIGN
    // =========================

    const participantsKey = `meeting:${meeting.id}:participants`;
    const joinedKey = `meeting:${meeting.id}:joined:${userId}`;

    //  Prevent duplicate join (optional optimization)
    const alreadyJoined = await redis.sismember(participantsKey, userId);

    if (!alreadyJoined) {
      await redis.sadd(participantsKey, userId);
    }

    //  Store join timestamp
    await redis.set(joinedKey, Date.now(), "EX", 86400);

    // =========================
    //  DB SYNC (HISTORY)
    // =========================

    await prisma.meetingParticipant.upsert({
      where: {
        meetingId_userId: {
          meetingId: meeting.id,
          userId,
        },
      },
      update: {
        leftAt: null, // user rejoined
      },
      create: {
        meetingId: meeting.id,
        userId,
        role: "PARTICIPANT",
      },
    });

    return NextResponse.json({
      meetingId: meeting.id,
    });

  } catch (error) {
    console.error("JOIN ERROR:", error);

    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}