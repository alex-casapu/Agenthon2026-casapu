import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
