import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable React strict mode for highlighting potential problems
  reactStrictMode: true,
  // Enable SWC minification for production
  swcMinify: true,
  // Ignore ESLint errors during builds
  eslint: {
    ignoreDuringBuilds: true,
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
