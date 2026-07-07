/**
 * FILE: components/shared/Header.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Sticky top navigation. Logo on left, nav links in center, Book Now CTA on right.
 * Mobile: hamburger menu toggles a dropdown nav. Desktop: full horizontal bar.
 *
 * DATA FLOW:
 * 1. Rendered inside app/visitor/layout.jsx above {children}
 * 2. Local state (menuOpen) controls mobile menu visibility
 * 3. No data fetching — fully static navigation
 */
"use client";

import { useState } from "react";
import Link from "next/link";
import "./Header.css";

/*
 * navLinks
 * All hrefs are anchor IDs that scroll to sections on the visitor homepage.
 * IDs: #rooms → FeaturedRoomsSection, #amenities → AmenitiesHighlightSection,
 * #shop → MiniStoreSection, #about → About, #contact → CTASection.
 */
const navLinks = [
  { label: "Rooms", href: "#rooms" },
  { label: "Amenities", href: "#amenities" },
  { label: "Shop", href: "#shop" },
  { label: "About", href: "#about" },
  { label: "Contact", href: "#contact" },
];

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="siteHeader">
      <div className="headerContainer">
        {/* Logo */}
        <Link href="/visitor" className="headerLogo">
          Villa Azure
        </Link>

        {/* Desktop nav */}
        <nav className="headerNav" aria-label="Main navigation">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className="headerNavLink">
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Book Now CTA — desktop */}
        <Link href="#contact" className="headerBookButton">
          Book Now
        </Link>

        {/* Hamburger — mobile only */}
        <button
          className="headerHamburger"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((prev) => !prev)}
        >
          {menuOpen ? (
            /* X icon */
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          ) : (
            /* Hamburger icon */
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <nav className="headerMobileMenu" aria-label="Mobile navigation">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="headerMobileNavLink"
              onClick={() => setMenuOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="#contact"
            className="headerMobileBookButton"
            onClick={() => setMenuOpen(false)}
          >
            Book Now
          </Link>
        </nav>
      )}
    </header>
  );
}
