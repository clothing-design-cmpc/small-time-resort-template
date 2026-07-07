/**
 * FILE: app/layout.jsx
 * ROLE: Applies to all account types (visitor, superAdmin)
 *
 * PURPOSE:
 * Root layout shell for the entire app. Holds only global metadata and
 * the global stylesheet import. No account-specific UI (nav, sidebar,
 * shell) lives here — each account folder has its own layout.jsx for that.
 *
 * TYPOGRAPHY:
 * Loads two separate font systems via next/font/google (never @import or
 * a Google Fonts <link> tag, per Next.js font standard):
 *   1. Visitor pairing — Fraunces (editorial serif for headings/eyebrows)
 *      + Manrope (body). Exposed as --font-heading / --font-body.
 *   2. Super-Admin pairing — Inter (body), Space Grotesk (display headings),
 *      JetBrains Mono (data/IDs/monospace labels), per the Super-Admin
 *      Control Center design system. Exposed as --font-admin-body /
 *      --font-admin-heading / --font-admin-mono. Only applied inside
 *      .superAdminRoot (see app/superAdmin/SuperAdmin.css) so the visitor
 *      site's own fonts are never affected.
 * All font variables are set once here at the <html> level so every
 * stylesheet in the app can reference them without re-importing fonts.
 *
 * DATA FLOW:
 * 1. Next.js renders this layout once for every route in the app.
 * 2. Global CSS tokens and reset are loaded here via globals.css.
 * 3. Account-specific layouts (e.g. app/visitor/layout.jsx) render inside
 *    the {children} slot below.
 */
import { Fraunces, Manrope, Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./styles/globals.css";
import "./styles/mediaQueries.css";

/* Display serif for headings, eyebrows, and the wordmark — optional-italic gives editorial CTA emphasis */
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600"],
  style: ["normal", "italic"],
  variable: "--font-heading",
  display: "swap",
});

/* Geometric sans for body copy, nav, and UI chrome — stays readable at small sizes */
const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

/* Super-Admin body font — clean, highly readable at small sizes for dense data UI */
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-admin-body",
  display: "swap",
});

/* Super-Admin display font — geometric, modern, used for h1/h2 page and section titles */
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-admin-heading",
  display: "swap",
});

/* Super-Admin monospace — table IDs, timestamps, eyebrows, and numeric data */
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-admin-mono",
  display: "swap",
});

export const metadata = {
  title: "Villa Azure Resort",
  description: "A private resort offering an intimate escape — rooms, amenities, and experiences.",
  openGraph: {
    title: "Villa Azure Resort",
    description: "A private resort offering an intimate escape — rooms, amenities, and experiences.",
    images: ["/images/og-villa-azure.jpg"],
  },
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${manrope.variable} ${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}