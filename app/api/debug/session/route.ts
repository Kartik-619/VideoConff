export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";

export async function GET() {
  const session = await getServerSession(authOptions);

  return NextResponse.json({
    session,
    hasSession: !!session,
    hasUser: !!session?.user,
    hasUserId: !!session?.user?.id,
  });
}
