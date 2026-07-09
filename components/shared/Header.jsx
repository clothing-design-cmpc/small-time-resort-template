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
 * "Rooms", "Amenities", "Shop", "About", and "Contact" are sections on
 * the one-page homepage (app/visitor/page.jsx) — not separate routes —
 * so they link to /visitor#<sectionId>, matching the real <section
 * id="..."> elements already rendered there (and the same pattern the
 * Footer's quick links already use). Only "Policies" is an actual
 * standalone page. Previously these pointed at /visitor/rooms,
 * /visitor/amenities, etc., which don't exist as routes — every one of
 * those 404'd.
 */
const navLinks = [
  { label: "Rooms", href: "/visitor#rooms" },
  { label: "Amenities", href: "/visitor#amenities" },
  { label: "Shop", href: "/visitor#shop" },
  { label: "About", href: "/visitor#about" },
  { label: "Policies", href: "/visitor/policies" },
  { label: "Contact", href: "/visitor#contact" },
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

        {/* Login + Book Now grouped together so the container's
            justify-content: space-between spaces out logo / nav / this
            group as a whole — not Login and Book Now individually,
            which was leaving a huge gap between the two. */}
        <div className="headerActions">
          {/* Staff/admin login — desktop. Kept visually quiet (text link,
              not a filled button) so it never competes with the Book Now CTA. */}
          <Link href="/superAdmin/login" className="headerLoginLink">
            Login
          </Link>

          {/* Book Now CTA — desktop */}
          <Link href="/visitor/booking" className="headerBookButton">
            Book Now
          </Link>
        </div>

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
            href="/visitor/booking"
            className="headerMobileBookButton"
            onClick={() => setMenuOpen(false)}
          >
            Book Now
          </Link>
          <Link
            href="/superAdmin/login"
            className="headerMobileLoginLink"
            onClick={() => setMenuOpen(false)}
          >
            Login
          </Link>
        </nav>
      )}
    </header>
  );
}
