import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable React strict mode for highlighting potential problems
  reactStrictMode: true,

  // Ignore ESLint errors during builds
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Headers for service worker scope
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Service-Worker-Allowed", value: "/" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
  // Example: allow images from Supabase storage and localhost
  images: {
    domains: [
      'localhost',
      'your-supabase-project-id.supabase.co', // <-- replace with your actual project id
    ],
  },
  // Optional: add trailing slashes to all routes
  trailingSlash: false,
  // Add more production settings as needed
};

export default nextConfig;
