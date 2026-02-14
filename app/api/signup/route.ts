import { prisma } from "@/lib/prisma";
import bcrypt from "bcrypt";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  const body = await req.json();
  const { name, email, password } = body;

  // 1. Basic validation
  if (!name || !email || !password) {
    return new Response("Missing fields", { status: 400 });
  }

  // 2. Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    return new Response("User already exists", { status: 409 });
  }

  // 3. Hash password
  const hashedPassword = await bcrypt.hash(password, 12);

  // 4. Save user
  await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
    },
  });

  return new Response("User created", { status: 201 });
}
