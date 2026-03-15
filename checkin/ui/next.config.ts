import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  compress: true,
  poweredByHeader: false,
  async rewrites() {
    return [
      { source: "/api/:path*", destination: "http://localhost:4001/api/:path*" },
    ];
  },
};

export default nextConfig;
