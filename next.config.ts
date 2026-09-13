import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  outputFileTracingIncludes: {
    "/api/preventivi/*/export/pdf": ["./assets/branding/giani-letterhead.jpg"],
  },
};

export default nextConfig;
