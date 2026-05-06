import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";

export const authOptions: NextAuthOptions = {

  providers: [

    // GOOGLE OAUTH
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),

    // EMAIL + PASSWORD LOGIN
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { type: "email" },
        password: { type: "password" },
      },

      async authorize(credentials) {

        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = credentials.email.trim().toLowerCase();

        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user) return null;

        // Account created with Google
        if (!user.password) {
          throw new Error("GOOGLE_ACCOUNT");
        }

        const valid = await bcrypt.compare(
          credentials.password,
          user.password
        );

        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
        };

      },
    }),

  ],

  session: {
    strategy: "jwt",
  },

  callbacks: {

    // HANDLE GOOGLE LOGIN
    async signIn({ user, account }) {

      if (account?.provider !== "google") {
        return true;
      }

      if (!user.email) return false;

      const email = user.email.trim().toLowerCase();

      // Check if user exists
      let existingUser = await prisma.user.findUnique({
        where: { email },
      });

      // Create if not exists
      if (!existingUser) {

        existingUser = await prisma.user.create({
          data: {
            email,
            name: user.name || "Google User",
            provider: "google",
            password: null,
            image: user.image,
          },
        });

      }

      // Attach DB id to session user
      user.id = existingUser.id;

      return true;
    },

    // ADD USER ID TO JWT
    async jwt({ token, user }) {

      if (user) {
        token.id = user.id;
      }

      return token;
    },

    // ADD USER ID TO SESSION
    async session({ session, token }) {

      if (session.user) {
        session.user.id = token.id as string;
        session.user.image = token.picture as string;
      }

      return session;
    },

  },

  pages: {
    signIn: "/login",
  },

  secret: process.env.NEXTAUTH_SECRET,
};