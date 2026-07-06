/**
 * FILE: app/visitor/layout.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Shell for every page under /visitor. Holds the visitor-specific
 * stylesheet import. Public nav/footer will be added here as those
 * sections are built (per the resort visitor master template plan).
 *
 * DATA FLOW:
 * 1. Every route under app/visitor/ renders inside this layout's {children}.
 * 2. No session check happens here — visitor pages are public by design.
 */
import "./Visitor.css";

export default function VisitorLayout({ children }) {
  return <section className="visitorShell">{children}</section>;
}
