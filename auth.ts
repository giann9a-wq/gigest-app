import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";

import { prisma } from "@/lib/prisma";

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  session: {
    strategy: "database",
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;

      const appUser = await prisma.user.findUnique({
        where: { email: user.email.toLowerCase() },
      });

      if (!appUser) {
        await prisma.accessRequest.upsert({
          where: { email: user.email.toLowerCase() },
          update: {
            firstName: user.name?.split(" ")[0] ?? null,
            lastName: user.name?.split(" ").slice(1).join(" ") || null,
          },
          create: {
            email: user.email.toLowerCase(),
            firstName: user.name?.split(" ")[0] ?? null,
            lastName: user.name?.split(" ").slice(1).join(" ") || null,
            status: "PENDING",
          },
        });
        return false;
      }

      return appUser.status === "ACTIVE";
    },
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
});
