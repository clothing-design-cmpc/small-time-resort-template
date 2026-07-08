/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Allows next/image to optimize placeholder photos pulled from Unsplash
    // during early scaffolding, before Cloudflare R2 is connected (Rule 27.1 —
    // next/image is required, raw <img> tags are never used).
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      // Cloudflare R2 public CDN — serves room/amenity/shop/activity/gallery
      // images uploaded via the super-admin content-management pages.
      {
        protocol: "https",
        hostname: "**.r2.dev",
      },
      {
        protocol: "https",
        hostname: "**.r2.cloudflarestorage.com",
      },
    ],
  },
};

export default nextConfig;
