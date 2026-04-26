import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/*": [
      "./scripts/**/*",
      "./templates/**/*",
      "./portals/**/*",
      "./runtime-assets/**/*",
      "./config/**/*",
      "./data/**/*",
      "./fonts/**/*",
    ],
  },
};

export default nextConfig;
