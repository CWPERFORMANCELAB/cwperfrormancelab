import type { NextConfig } from "next";
import createMDX from "@next/mdx";

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
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

const withMDX = createMDX({
  options: { remarkPlugins: [["remark-gfm", {}]] },
});

export default withMDX(nextConfig);
