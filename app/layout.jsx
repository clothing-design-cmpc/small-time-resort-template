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
 * Loads the resort's two-font pairing via next/font/google (never @import
 * or a Google Fonts <link> tag, per Next.js font standard). Fraunces is a
 * warm editorial serif used for headings/eyebrows — it gives the resort
 * brand personality a generic sans stack can't. Manrope stays as the body
 * font for clean, easy long-form reading. Both are exposed as CSS custom
 * properties (--font-heading / --font-body) so globals.css and every
 * component stylesheet can reference them without re-importing fonts.
 *
 * DATA FLOW:
 * 1. Next.js renders this layout once for every route in the app.
 * 2. Global CSS tokens and reset are loaded here via globals.css.
 * 3. Account-specific layouts (e.g. app/visitor/layout.jsx) render inside
 *    the {children} slot below.
 */
import { Fraunces, Manrope } from "next/font/google";
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
    <html lang="en" className={`${fraunces.variable} ${manrope.variable}`}>
      <body>{children}</body>
    </html>
  );
}
