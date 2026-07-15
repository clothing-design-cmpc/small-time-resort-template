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
  // geoip-lite/maxmind (services/analytics.js, services/accountActivity.js,
  // services/geoip.js — Rule 38/41/42) both read sibling data files off disk
  // via a __dirname-relative path at MODULE LOAD time. When Turbopack (the
  // Next 16 dev/build bundler) bundles these packages into its own server
  // chunks, it rewrites __dirname to a virtual bundler root — confirmed by
  // the dev error path "C:\ROOT\node_modules\geoip-lite\data\..." instead of
  // the real project path — so the ENOENT is a bundling problem, not a
  // missing-file problem; the .dat files were on disk the whole time.
  // serverExternalPackages tells Next/Turbopack to leave these packages
  // un-bundled and load them with a real runtime require() instead, which
  // keeps their real __dirname and lets them find their own data files. This
  // must be a plain root-level array (not per-route), and must list every
  // package that touches its own __dirname at runtime.
  serverExternalPackages: ["geoip-lite", "maxmind"],
  // Belt-and-suspenders for traced production output (standalone/Vercel):
  // even with the above, an output-file-traced build only copies files the
  // tracer can see being required — it still can't see geoip-lite's own
  // dynamic fs.readFileSync() calls, so the data folder must be listed here
  // too or a traced prod deploy would hit the same ENOENT that dev just did.
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
