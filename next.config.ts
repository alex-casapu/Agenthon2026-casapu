import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  async redirects() {
    return [
      { source: "/", destination: "/slides/title", permanent: false },
      { source: "/slides", destination: "/slides/title", permanent: false },
    ];
  },
  devIndicators: false, // the dev badge overlaps the checklist strip on stage
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
