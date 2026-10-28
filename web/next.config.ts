import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Pin the project root so a stray lockfile in a parent folder is not picked up.
  turbopack: { root: path.resolve(__dirname) },
};

export default nextConfig;
