/**
 * FILE: components/shared/Header.jsx
 * ROLE: Visitor — shared across every page under app/visitor/
 *
 * PURPOSE:
 * Sticky site header. Shows the resort wordmark, in-page nav links
 * (Home/About anchors) plus a link to the Booking page, and a
 * "Book Now" CTA. Collapses into a toggleable mobile menu below the
 * tablet breakpoint.
 *
 * DATA FLOW:
 * 1. Rendered once by app/visitor/layout.jsx, shared across all
 *    visitor pages — outside <PageTransition> so it never re-animates
 *    on navigation between pages
 * 2. isMobileMenuOpen is local UI state — toggled by the hamburger
 *    button, closed automatically when a link is clicked
 */
"use client";

import { useState } from "react";
import Link from "next/link";
import "./Header.css";

const navLinks = [
  { href: "/#about", label: "About" },
  { href: "/#rooms", label: "Rooms & Villas" },
  { href: "/visitor/policies", label: "Policies" },
];

export default function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Closes the mobile menu whenever a nav link is clicked, so the menu
  // never stays open after the visitor has already navigated away.
  function handleNavLinkClick() {
    setIsMobileMenuOpen(false);
  }

  return (
    <header className="siteHeader">
      <div className="headerContainer">
        <Link href="/" className="headerLogo" onClick={handleNavLinkClick}>
          Villa Azure Resort
        </Link>

        <nav className="headerNav" aria-label="Primary">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className="headerNavLink">
              {link.label}
            </Link>
          ))}
        </nav>

        <Link href="/visitor/booking" className="headerCta">
          Book Now
        </Link>

        {/* Mobile-only hamburger toggle — hidden at tablet breakpoint and up via mediaQueries.css */}
        <button
          type="button"
          className="headerMobileToggle"
          aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
          aria-expanded={isMobileMenuOpen}
          onClick={() => setIsMobileMenuOpen((open) => !open)}
        >
          <span className="headerMobileToggleBar" />
          <span className="headerMobileToggleBar" />
          <span className="headerMobileToggleBar" />
        </button>
      </div>

      {/* Mobile dropdown menu — only rendered when open */}
      {isMobileMenuOpen && (
        <nav className="headerMobileMenu" aria-label="Mobile">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="headerMobileMenuLink"
              onClick={handleNavLinkClick}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/visitor/booking"
            className="headerMobileMenuCta"
            onClick={handleNavLinkClick}
          >
            Book Now
          </Link>
        </nav>
      )}
    </header>
  );
}
