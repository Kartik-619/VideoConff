export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

export async function POST(req: Request) {
  try {
    console.log("JOIN ROUTE HIT");

    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { meetingCode } = await req.json();

    if (!meetingCode) {
      return NextResponse.json(
        { error: "Meeting code required" },
        { status: 400 }
      );
    }

    // Normalize meeting code
    const normalizedCode = meetingCode.trim().toUpperCase();

    // Validate format
    if (normalizedCode.length !== 6) {
      return NextResponse.json(
        { error: "Invalid meeting code format" },
        { status: 400 }
      );
    }

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

    // Add participant to Redis
    const participantsKey = `meeting:${meeting.id}:participants`;

    await redis.sadd(
      participantsKey,
      session.user.id
    );

    // Store join timestamp with TTL
    await redis.set(
      `meeting:${meeting.id}:joined:${session.user.id}`,
      Date.now(),
      "EX",
      7200
    );

    return NextResponse.json({
      meetingId: meeting.id,
    });

  } catch (err) {
    console.error("JOIN ERROR:", err);

    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}