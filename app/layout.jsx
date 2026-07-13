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
 */
import "./styles/globals.css";
import "./styles/mediaQueries.css";

export const metadata = {
  title: "Villa Azure Resort",
  description: "Book your stay at Villa Azure Resort.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
