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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { meetingId } = await req.json();

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
    });

    if (!meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    if (meeting.hostId !== session.user.id) {
      return NextResponse.json({ error: "Only host can end" }, { status: 403 });
    }

    await prisma.meeting.update({
      where: { id: meetingId },
      data: { status: "ENDED" },
    });

    // 🧹 Clear Redis participants
    await redis.del(`meeting:${meetingId}:participants`);

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("END ERROR:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
