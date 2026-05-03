import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ['pg', 'ioredis', 'bullmq', '@prisma/client', 'bcryptjs', 'jsonwebtoken'],
};

export default nextConfig;
