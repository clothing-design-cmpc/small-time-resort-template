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
import { cache } from "react";
import "./styles/globals.css";
import "./styles/mediaQueries.css";
import AnalyticsBeacon from "@/components/shared/AnalyticsBeacon";
import RightClickGuard from "@/components/shared/RightClickGuard";
import { prisma } from "@/services/prisma";
import { darkenHexColor, hexToRgbaString } from "@/utils/colorShade";

const DEFAULT_RESORT_NAME = "your-private-resort";
const DEFAULT_RESORT_DESCRIPTION =
  "A private resort offering an intimate escape — rooms, amenities, and experiences.";
const DEFAULT_ACCENT_COLOR = "#3f7d52";
const DEFAULT_SECONDARY_COLOR = "#c9935e";
const DEFAULT_BACKGROUND_COLOR = "#f8faf3";
const DEFAULT_TEXT_COLOR = "#1c2b20";
const DEFAULT_BORDER_COLOR = "#e5e2db";

/**
 * getBrandIdentity
 * Reads the singleton SystemSettings row for the resort's display
 * name (siteTitle), SEO description, OG image, and the 5-token brand
 * color system — used below by both generateMetadata() and the
 * <html> tag's inline CSS variable override. Wrapped in React's
 * cache() so both callers share one DB read per request instead of
 * two. Fails safe to the placeholder defaults on any DB error so the
 * site never 500s on this alone.
 */
const getBrandIdentity = cache(async function getBrandIdentity() {
  try {
    const settings = await prisma.systemSettings.findUnique({
      where: { id: "singleton" },
      select: {
        siteTitle: true,
        siteDescription: true,
        ogImageUrl: true,
        brandAccentColor: true,
        brandSecondaryColor: true,
        brandBackgroundColor: true,
        brandTextColor: true,
        brandBorderColor: true,
      },
    });

    return {
      resortName: settings?.siteTitle || DEFAULT_RESORT_NAME,
      resortDescription: settings?.siteDescription || DEFAULT_RESORT_DESCRIPTION,
      ogImageUrl: settings?.ogImageUrl || "/images/og-villa-azure.jpg",
      accentColor: settings?.brandAccentColor || DEFAULT_ACCENT_COLOR,
      secondaryColor: settings?.brandSecondaryColor || DEFAULT_SECONDARY_COLOR,
      backgroundColor: settings?.brandBackgroundColor || DEFAULT_BACKGROUND_COLOR,
      textColor: settings?.brandTextColor || DEFAULT_TEXT_COLOR,
      borderColor: settings?.brandBorderColor || DEFAULT_BORDER_COLOR,
    };
  } catch {
    return {
      resortName: DEFAULT_RESORT_NAME,
      resortDescription: DEFAULT_RESORT_DESCRIPTION,
      ogImageUrl: "/images/og-villa-azure.jpg",
      accentColor: DEFAULT_ACCENT_COLOR,
      secondaryColor: DEFAULT_SECONDARY_COLOR,
      backgroundColor: DEFAULT_BACKGROUND_COLOR,
      textColor: DEFAULT_TEXT_COLOR,
      borderColor: DEFAULT_BORDER_COLOR,
    };
  }
});

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

// Replaces the old static `export const metadata` object — the resort
// name/description/OG image are now admin-editable (Super-Admin >
// Content > Homepage > Brand Identity), so the <title> tag and social
// share metadata must be resolved from the DB on every request instead
// of being hardcoded here.
export async function generateMetadata() {
  const { resortName, resortDescription, ogImageUrl } = await getBrandIdentity();

  return {
    title: resortName,
    description: resortDescription,
    openGraph: {
      title: resortName,
      description: resortDescription,
      images: [ogImageUrl],
    },
  };
}

export default async function RootLayout({ children }) {
  const { accentColor, secondaryColor, backgroundColor, textColor, borderColor } = await getBrandIdentity();

  // Every value below is DERIVED at render time from the 5 raw hex
  // colors above — no hover shade, tint, or opacity variant is ever
  // stored on its own. See utils/colorShade.js and the schema comment
  // on SystemSettings.brandAccentColor for the full role mapping.
  const accentColorHover = darkenHexColor(accentColor, 0.2);
  const secondaryColorHover = darkenHexColor(secondaryColor, 0.2);
  const textColorSecondary = hexToRgbaString(textColor, 0.64);
  const textColorMuted = hexToRgbaString(textColor, 0.44);
  const borderColorBase = hexToRgbaString(borderColor, 0.12);
  const borderColorHover = hexToRgbaString(borderColor, 0.24);
  const borderColorStrong = hexToRgbaString(borderColor, 0.28);
  // Surfaces (card/panel backgrounds) read as a faint tint of the
  // border/neutral color rather than the raw background — this is
  // what makes cards look "lifted" off the page background instead
  // of just bordered.
  const surfaceColor = hexToRgbaString(borderColor, 0.05);
  const surfaceColorHover = hexToRgbaString(borderColor, 0.09);
  const surfaceColorActive = hexToRgbaString(borderColor, 0.14);

  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${manrope.variable} ${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
      // Overrides the color tokens declared in app/styles/globals.css
      // with the admin's chosen 5-color brand system (Super-Admin >
      // Content > Homepage > Brand Identity) — every button, card,
      // border, and body of text across the visitor site reads these
      // variables, so this single override re-themes the whole public
      // site without touching any component CSS file.
      style={{
        "--color-accent": accentColor,
        "--color-accent-hover": accentColorHover,
        "--color-secondary": secondaryColor,
        "--color-secondary-hover": secondaryColorHover,
        "--color-bg": backgroundColor,
        "--color-text-primary": textColor,
        "--color-text-secondary": textColorSecondary,
        "--color-text-muted": textColorMuted,
        "--color-border": borderColorBase,
        "--color-border-hover": borderColorHover,
        "--color-border-strong": borderColorStrong,
        "--color-surface": surfaceColor,
        "--color-surface-hover": surfaceColorHover,
        "--color-surface-active": surfaceColorActive,
      }}
    >
      <body>
        <AnalyticsBeacon />
        <RightClickGuard />
        {children}
      </body>
    </html>
  );
}