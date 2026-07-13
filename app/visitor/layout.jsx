/**
 * FILE: app/visitor/layout.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Shell for every page under /visitor. Renders the sticky Header above
 * all content and the Footer below. The {children} slot receives each
 * individual page (homepage, rooms, booking, etc.).
 *
 * DATA FLOW:
 * 1. Every route under app/visitor/ renders inside this layout's {children}
 * 2. No session check happens here — visitor pages are public by design
 * 3. Header and Footer are rendered once, shared across all visitor pages —
 *    they sit outside <PageTransition> so they never re-animate on navigation
 * 4. {children} is wrapped in <PageTransition> so switching between the
 *    homepage, booking, and policies pages cross-fades smoothly instead of
 *    swapping instantly (Dynamic design tier)
 */
import "./Visitor.css";
import Header from "@/components/shared/Header";
import Footer from "@/components/shared/Footer";
import ScrollToTopOnLoad from "@/components/shared/ScrollToTopOnLoad";
import PageTransition from "@/components/shared/motion/PageTransition";

export default function VisitorLayout({ children }) {
  return (
    <div className="visitorShell">
      {/* Ensures every page load/refresh opens on the Hero section
          instead of the browser restoring a previous scroll position */}
      <ScrollToTopOnLoad />
      <Header />
      {/* pt-[header height] so page content is never hidden behind the sticky header */}
      <div className="visitorContent">
        <PageTransition>{children}</PageTransition>
      </div>
      <Footer />
    </div>
  );
}
