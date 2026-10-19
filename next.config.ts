import type { NextConfig } from "next";
import createMDX from "@next/mdx";
import { securityHeaders } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  pageExtensions: ["ts", "tsx", "md", "mdx"],
  images: {
    // 75 = default for photos; 92 for portrait/hero shots that need to stay crisp (set per slot in content/media.json).
    qualities: [75, 92],
    formats: ["image/avif", "image/webp"],
  },
  serverExternalPackages: ["@electric-sql/pglite", "postgres", "bcryptjs"],
  outputFileTracingIncludes: {
    "/**": ["./src/db/migrations/**", "./content/**", "./config/**", "./public/brand/**"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    const opts = {
      dev: process.env.NODE_ENV === "development",
      plausible: Boolean(process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN),
      sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    };
    return [
      // Order matters: for the same header key, the LAST matching rule wins, so the stricter admin rule comes last.
      { source: "/(.*)", headers: securityHeaders(opts) },
      { source: "/admin/:path*", headers: securityHeaders({ ...opts, admin: true }) },
      { source: "/api/admin/:path*", headers: securityHeaders({ ...opts, admin: true }) },
    ];
  },
};

const withMDX = createMDX({
  options: { remarkPlugins: [["remark-gfm", {}]] },
});

export default withMDX(nextConfig);
