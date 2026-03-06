export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";

export async function GET(
  req: Request,
  context: { params: Promise<{ meetingId: string }> }
) {
  try {

    const { meetingId } = await context.params;

    const count = await redis.scard(
      `meeting:${meetingId}:participants`
    );

    return NextResponse.json({ count });

  } catch (error) {

    console.error("COUNT ERROR:", error);

    return NextResponse.json(
      { error: "Failed to get participant count" },
      { status: 500 }
    );

  }
}