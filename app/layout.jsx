/**
 * FILE: app/layout.jsx
 * ROLE: Applies to all account types (visitor, superAdmin)
 *
 * PURPOSE:
 * Root layout shell for the entire app. Holds only global metadata and
 * the global stylesheet import. No account-specific UI (nav, sidebar,
 * shell) lives here — each account folder has its own layout.jsx for that.
 *
 * DATA FLOW:
 * 1. Next.js renders this layout once for every route in the app.
 * 2. Global CSS tokens and reset are loaded here via globals.css.
 * 3. Account-specific layouts (e.g. app/visitor/layout.jsx) render inside
 *    the {children} slot below.
 */
import "./styles/globals.css";
import "./styles/mediaQueries.css";

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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
