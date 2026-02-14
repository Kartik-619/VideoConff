export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redis } from "@/lib/redis";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { meetingId } = await req.json();

    await redis.srem(
      `meeting:${meetingId}:participants`,
      session.user.id
    );

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("LEAVE ERROR:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
