import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Set Turbopack root to avoid workspace detection warnings
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
