/**
 * FILE: components/shared/Footer.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Site footer with three columns: quick links, contact info, and tagline.
 * Copyright notice at the bottom. Matches the dark tone of the header.
 *
 * DATA FLOW:
 * 1. Rendered inside app/visitor/layout.jsx below {children}
 * 2. No data fetching — fully static content
 */
import Link from "next/link";
import "./Footer.css";

const quickLinks = [
  { label: "Rooms & Villas", href: "/visitor/rooms" },
  { label: "Amenities", href: "/visitor/amenities" },
  { label: "Gallery", href: "/visitor/gallery" },
  { label: "About Us", href: "/visitor/about" },
  { label: "Contact", href: "/visitor/contact" },
  { label: "Policies", href: "/visitor/policies" },
];

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="siteFooter">
      <div className="footerContainer">
        {/* Column 1 — Brand + tagline */}
        <div className="footerBrand">
          <span className="footerLogoText">Villa Azure Resort</span>
          <p className="footerTagline">
            An intimate private retreat on a quiet shoreline. A handful of villas, a small attentive team, and nothing else to distract you.
          </p>
        </div>

        {/* Column 2 — Quick Links */}
        <nav className="footerNav" aria-label="Footer navigation">
          <span className="footerNavLabel">Explore</span>
          <ul className="footerNavList">
            {quickLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="footerNavLink">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Column 3 — Contact Info */}
        <div className="footerContact">
          <span className="footerNavLabel">Contact</span>
          <ul className="footerContactList">
            <li className="footerContactItem">
              <span className="footerContactLabel">Phone</span>
              <a href="tel:+639XXXXXXXXX" className="footerContactValue">+63 9XX XXX XXXX</a>
            </li>
            <li className="footerContactItem">
              <span className="footerContactLabel">Email</span>
              <a href="mailto:hello@villaazure.com" className="footerContactValue">hello@villaazure.com</a>
            </li>
            <li className="footerContactItem">
              <span className="footerContactLabel">Location</span>
              <span className="footerContactValue">Philippines</span>
            </li>
            <li className="footerContactItem">
              <span className="footerContactLabel">Check-in</span>
              <span className="footerContactValue">2:00 PM</span>
            </li>
            <li className="footerContactItem">
              <span className="footerContactLabel">Check-out</span>
              <span className="footerContactValue">12:00 PM</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="footerBottom">
        <div className="footerBottomContainer">
          <span className="footerCopyright">© {currentYear} Villa Azure Resort. All rights reserved.</span>
          <div className="footerLegalLinks">
            <Link href="/visitor/policies" className="footerLegalLink">Privacy Policy</Link>
            <Link href="/visitor/policies" className="footerLegalLink">Terms & Conditions</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
