import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

const authConfig = {
  providers: [
    Google({
      allowDangerousEmailAccountLinking: true,
      authorization: {
        params: {
          access_type: "offline",
          scope: [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/calendar.app.created",
          ].join(" "),
        },
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth }) {
      return !!auth;
    },
  },
} satisfies NextAuthConfig;

export default authConfig;
