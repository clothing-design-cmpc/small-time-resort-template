/**
 * FILE: next.config.mjs
 * PURPOSE:
 * Root Next.js configuration.
 *
 * images.remotePatterns: next/image blocks any remote host that isn't
 * explicitly whitelisted. images.unsplash.com is here because Hero.jsx
 * uses a placeholder Unsplash photo — replace with the Cloudflare R2
 * public host once real resort photography is uploaded (Rule 35.6),
 * and remove this entry then.
 */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
};

export default nextConfig;
