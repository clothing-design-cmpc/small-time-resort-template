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

/*
 * quickLinks
 * Hrefs use "/visitor#sectionId" (not a bare "#sectionId") so they
 * work no matter which page the visitor is currently on — a bare hash
 * only scrolls within the CURRENT page, so clicking "Rooms" from
 * /visitor/policies previously did nothing (no id="rooms" exists
 * there). "/visitor#rooms" always navigates to the homepage first,
 * then scrolls to that section. "Gallery" was removed — there's no
 * Gallery section on the page yet, so it was a dead link either way.
 * Add it back here once a Gallery section with id="gallery" is built.
 */
const quickLinks = [
  { label: "Rooms & Villas", href: "/visitor#rooms" },
  { label: "Amenities",      href: "/visitor#amenities" },
  { label: "Shop",           href: "/visitor#shop" },
  { label: "About Us",       href: "/visitor#about" },
  { label: "Activities",     href: "/visitor/activities" },
  { label: "Gallery",        href: "/visitor/gallery" },
  { label: "Contact",        href: "/visitor#contact" },
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

        {/* Column 3 — Contact Info. id="contact" is the actual scroll
            target for every "#contact" link in this app (Header nav,
            this footer's own Contact link, and the legal links below) —
            without it those links silently do nothing. */}
        <div className="footerContact" id="contact">
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
          {/* app/visitor/policies now exists, so both legal links go
              straight there instead of the old placeholder (#contact). */}
          <div className="footerLegalLinks">
            <Link href="/visitor/policies" className="footerLegalLink">Privacy Policy</Link>
            <Link href="/visitor/policies" className="footerLegalLink">Terms &amp; Conditions</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}