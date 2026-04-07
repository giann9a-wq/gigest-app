export { auth as middleware } from "@/auth";

export const config = {
  matcher: ["/dashboard/:path*", "/diario/:path*", "/risorse/:path*", "/mezzi/:path*", "/commesse/:path*", "/scadenziario/:path*"],
};
