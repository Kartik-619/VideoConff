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
        OR: [

          // Meetings hosted by user
          {
            hostId: session.user.id,
          },

          // Meetings joined by user
          {
            participants: {
              some: {
                userId: session.user.id,
              },
            },
          },

        ],
      },

      include: {

        host: {
          select: {
            name: true,
            email: true,
          },
        },

        participants: {
          where: {
            userId: session.user.id,
          },
          select: {
            role: true,
            joinedAt: true,
            leftAt: true,
          },
        },

      },

      orderBy: {
        createdAt: "desc",
      },

    });

    return NextResponse.json({
      meetings,
    });

  } catch (error) {

    console.error("HISTORY ERROR:", error);

    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );

  }
}