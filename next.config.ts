import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow native modules used by pdf-to-png-converter to remain external for server builds
  serverExternalPackages: ['pdf-to-png-converter', '@napi-rs/canvas']
};

export default nextConfig;
