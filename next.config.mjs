/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Modern formats first, WebP as the safe fallback for older browsers.
    formats: ["image/avif", "image/webp"],
    // Product photos are replaced rarely; a long cache TTL keeps repeat
    // visits and carousel swipes from re-downloading the same bytes.
    minimumCacheTTL: 60 * 60 * 24 * 30,
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "**.googleusercontent.com" },
    ],
  },
};

export default nextConfig;