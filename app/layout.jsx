/**
 * FILE: app/layout.jsx
 * ROLE: Root layout — applies to every route in the project
 *
 * PURPOSE:
 * Wraps the entire app in the root <html>/<body> shell and sets the
 * default metadata (title, description) used when a page doesn't
 * define its own. Holds no account-specific UI — visitor, member,
 * and admin layouts each build their own shell on top of this one.
 *
 * DATA FLOW:
 * 1. Every route (currently only app/visitor/*) renders inside
 *    this layout's {children}
 * 2. Global stylesheet (globals.css) is imported once here so
 *    design tokens and resets apply everywhere
 * 3. next/font loads Fraunces (headings) and Inter (body) and exposes
 *    them as the --font-heading / --font-body CSS variables that
 *    globals.css already references
 */
import { Fraunces, Inter } from "next/font/google";
import "./styles/globals.css";
import "./styles/mediaQueries.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const metadata = {
  title: "Villa Azure Resort",
  description: "Book your stay at Villa Azure Resort.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
