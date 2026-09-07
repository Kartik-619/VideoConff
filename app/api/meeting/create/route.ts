export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeRedis } from "@/lib/redis";

//  Generate meeting code
function generateMeetingCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

//  Ensure unique meeting code
async function generateUniqueCode() {
  let code: string;
  let exists = true;

  while (exists) {
    code = generateMeetingCode();

    const meeting = await prisma.meeting.findUnique({
      where: { meetingCode: code },
    });

    if (!meeting) exists = false;
  }

  return code!;
}

export async function POST() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    //  Generate safe unique code
    const meetingCode = await generateUniqueCode();

    //  Create meeting in DB
    const meeting = await prisma.meeting.create({
      data: {
        meetingCode,
        status: "CREATED",
        host: {
          connect: { id: userId },
        },
      },
    });

    //  Add host to DB participants (history)
    await prisma.meetingParticipant.create({
      data: {
        meetingId: meeting.id,
        userId,
        role: "HOST",
      },
    });

    // =========================
    //  REDIS DESIGN APPLIED
    // =========================

    const participantsKey = `meeting:${meeting.id}:participants`;
    const hostKey = `meeting:${meeting.id}:host`;
    const statusKey = `meeting:${meeting.id}:status`;

    await safeRedis(async (r) => {
      await r.set(hostKey, userId);
      await r.set(statusKey, "CREATED");
      await r.sadd(participantsKey, userId);
      await r.expire(participantsKey, 86400);
      await r.expire(hostKey, 86400);
      await r.expire(statusKey, 86400);
    }, null);

    return NextResponse.json({
      meetingId: meeting.id,
      meetingCode: meeting.meetingCode,
    });

  } catch (error) {
    console.error("CREATE ERROR:", error);

    return NextResponse.json(
      { error: "Failed to create meeting" },
      { status: 500 }
    );
  }
}