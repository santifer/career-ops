import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/*": [
      "./scripts/**/*",
      "./templates/**/*",
      "./portals/**/*",
      "./config/**/*",
      "./data/**/*",
      "./fonts/**/*",
    ],
  },
};

export default nextConfig;
