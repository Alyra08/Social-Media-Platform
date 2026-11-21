import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dashboard data is per-request and approval-sensitive, so pages render dynamically.
  cacheComponents: false,
  serverExternalPackages: ["@electric-sql/pglite", "pg", "node-cron"],
  experimental: {
    serverActions: { bodySizeLimit: "25mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
