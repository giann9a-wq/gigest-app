import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  outputFileTracingIncludes: {
    "/api/preventivi/*/export/pdf": [
      "./assets/branding/giani-letterhead.jpg",
      "./node_modules/pdfkit/package.json",
      "./node_modules/pdfkit/js/pdfkit.standalone.js",
    ],
  },
};

export default nextConfig;
