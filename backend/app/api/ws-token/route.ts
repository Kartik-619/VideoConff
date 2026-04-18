import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import jwt from "jsonwebtoken";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const token = jwt.sign(
    { id: session.user.id },
    process.env.NEXTAUTH_SECRET!,
    { expiresIn: "2m" } // short-lived
  );

  return Response.json({ token });
}