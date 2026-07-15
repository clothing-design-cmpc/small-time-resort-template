// If NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL is a custom CNAME domain
// (e.g. "https://cdn.villaazureresort.com") instead of the default
// *.r2.dev / *.r2.cloudflarestorage.com subdomain, next/image throws
// "hostname is not configured" for every already-uploaded image the
// moment an edit form tries to preview it (Rooms, Resort Shop,
// Activities, Gallery, etc. all hit this the same way) — added here so
// whatever host is actually configured always works, not just the
// wildcard R2 subdomain patterns below.
function getR2PublicHostname() {
  const publicUrl = process.env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL;
  if (!publicUrl) return null;
  try {
    return new URL(publicUrl).hostname;
  } catch {
    return null;
  }
}

const r2PublicHostname = getR2PublicHostname();

/** @type {import('next').NextConfig} */
const nextConfig = {
  // geoip-lite (services/analytics.js, services/accountActivity.js — Rule
  // 41/42) loads its .dat files from disk via a __dirname-relative path at
  // runtime. Next.js's output file tracer only bundles files it can see
  // being required directly — it never sees geoip-lite's own dynamic
  // fs.readFileSync() calls, so the multi-MB .dat files silently get left
  // out of the traced output. Every server-side geoip-lite lookup then
  // throws "missing data file", which recordPageView()/recordAccountActivity()
  // swallow (fire-and-forget, never-break-the-request pattern) — so it never
  // surfaces as a visible error, just empty country data on every row.
  // Explicitly including the data folder here fixes it for both `next dev`
  // and any traced production output (standalone or Vercel).
  outputFileTracingIncludes: {
    "/**": ["./node_modules/geoip-lite/data/**"],
  },
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
      // Whatever host is actually configured in NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL —
      // covers custom CNAME domains that don't match the wildcards above.
      ...(r2PublicHostname
        ? [{ protocol: "https", hostname: r2PublicHostname }]
        : []),
    ],
  },
};

export default nextConfig;
