import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "http://10.189.82.160:3000"
  ],
  reactStrictMode: false,
};

export default nextConfig;