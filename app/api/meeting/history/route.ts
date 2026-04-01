export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {

    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const meetings = await prisma.meeting.findMany({
      where: {
        hostId: session.user.id
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    return NextResponse.json({ meetings });

  } catch (error) {

    console.error("HISTORY ERROR:", error);

    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );

  }
}