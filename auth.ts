import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";

import authConfig from "@/auth.config";
import { prisma } from "@/lib/prisma";

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  callbacks: {
    ...authConfig.callbacks,
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
    async jwt({ token, user }) {
      if (user?.id) {
        token.id = user.id;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.id ?? token.sub ?? "");
      }
      return session;
    },
  },
});
