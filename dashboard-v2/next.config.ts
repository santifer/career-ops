import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Exec API spawns node scripts at runtime; keep their dependencies/assets available.
  serverExternalPackages: [
    "js-yaml",
    "yaml",
    "postgres",
    "playwright",
    "@huggingface/inference",
  ],
  outputFileTracingIncludes: {
    "/*": [
      "./scripts/**/*",
      "./templates/**/*",
      "./portals/**/*",
      "../templates/**/*",
      "../portals/**/*",
      "./config/**/*",
      "./data/**/*",
      "./fonts/**/*",
    ],
  },
};

export default nextConfig;
