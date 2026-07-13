/**
 * FILE: components/shared/Footer.jsx
 * ROLE: Visitor — shared across every page under app/visitor/
 *
 * PURPOSE:
 * Site footer. Repeats the wordmark, quick links to the pages that
 * exist so far, and a copyright line with a dynamic year.
 *
 * DATA FLOW:
 * 1. Rendered once by app/visitor/layout.jsx, after {children}
 * 2. No data fetching — fully static content
 */
import Link from "next/link";
import "./Footer.css";

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="siteFooter">
      <div className="footerContainer">
        <div className="footerBrand">
          <span className="footerLogoText">Villa Azure Resort</span>
          <p className="footerTagline">
            Intimate villas, quiet shores, and distance from everything else.
          </p>
        </div>

        <nav className="footerLinks" aria-label="Footer">
          <Link href="/#about" className="footerLink">About</Link>
          <Link href="/visitor/booking" className="footerLink">Book Now</Link>
          <Link href="/visitor/policies" className="footerLink">Policies</Link>
        </nav>
      </div>

      <div className="footerBottom">
        <p>&copy; {currentYear} Villa Azure Resort. All rights reserved.</p>
      </div>
    </footer>
  );
}
