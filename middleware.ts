import NextAuth from "next-auth";
import authConfig from "@/auth.config";

export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/dashboard2/:path*",
    "/dashboard_old/:path*",
    "/diario/:path*",
    "/risorse/:path*",
    "/mezzi/:path*",
    "/commesse/:path*",
    "/scadenziario/:path*",
    "/stampa-risorse-mese/:path*",
    "/statistiche-risorse-commesse/:path*",
    "/caricamenti/:path*",
    "/admin/:path*",
  ],
};
