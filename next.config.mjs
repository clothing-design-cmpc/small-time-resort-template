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
    ],
  },
};

export default nextConfig;
