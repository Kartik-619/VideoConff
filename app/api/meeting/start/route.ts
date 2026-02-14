export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { meetingId } = await req.json();

    if (!meetingId) {
      return NextResponse.json(
        { error: "Meeting ID required" },
        { status: 400 }
      );
    }

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
    });

    if (!meeting) {
      return NextResponse.json(
        { error: "Meeting not found" },
        { status: 404 }
      );
    }

    // Only host can start
    if (meeting.hostId !== session.user.id) {
      return NextResponse.json(
        { error: "Only host can start meeting" },
        { status: 403 }
      );
    }

    await prisma.meeting.update({
      where: { id: meetingId },
      data: { status: "LIVE" }, // MUST be LIVE
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("START ERROR:", error);
    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}
