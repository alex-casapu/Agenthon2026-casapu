import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  async redirects() {
    return [{ source: "/", destination: "/debug", permanent: false }];
  },
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
