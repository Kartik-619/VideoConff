export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

function generateMeetingCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export async function POST() {

  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  const meeting = await prisma.meeting.create({
    data: {
      meetingCode: generateMeetingCode(),
      status: "CREATED",
      host: {
        connect: { id: userId },
      },
    },
  });

  await redis.set(`meeting:${meeting.id}:status`, "CREATED");
  await redis.set(`meeting:${meeting.id}:host`, userId);
  await redis.sadd(`meeting:${meeting.id}:participants`, userId);

  await redis.expire(`meeting:${meeting.id}:participants`, 7200);
  await redis.expire(`meeting:${meeting.id}:status`, 7200);
  await redis.expire(`meeting:${meeting.id}:host`, 7200);

  return NextResponse.json({
    meetingId: meeting.id,
    meetingCode: meeting.meetingCode,
  });
}
