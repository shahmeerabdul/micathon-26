import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Let Next bundle the workspace package's raw TS source so the voice
  // route handlers can import `@khata/server/*` directly.
  transpilePackages: ["@khata/server"],
  // Voice route handlers accept multipart audio uploads.
  // Server Actions share the same body-size limit.
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
