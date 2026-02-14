export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";

export async function GET(
  req: Request,
  context: { params: Promise<{ meetingId: string }> }
) {
  try {
    const { meetingId } = await context.params;

    const participants = await redis.smembers(
      `meeting:${meetingId}:participants`
    );

    return NextResponse.json({ participants });

  } catch (err) {
    console.error("Participants fetch error:", err);

    return NextResponse.json(
      { error: "Failed to fetch participants" },
      { status: 500 }
    );
  }
}
