/**
 * FILE: components/shared/Header.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Sticky top navigation. Logo on left, nav links in center, Book Now CTA on right.
 * Mobile + tablet (up to 1023px): hamburger menu toggles a dropdown nav.
 * Desktop (1024px+): full horizontal bar. Breakpoint lives in
 * app/styles/mediaQueries.css, not here.
 *
 * DATA FLOW:
 * 1. Rendered inside app/visitor/layout.jsx above {children}, inside
 *    <HeaderMenuProvider> alongside PromoAlertBanner (a sibling that
 *    hides itself while the mobile dropdown is open — see
 *    HeaderMenuContext.jsx's file header for why that's needed)
 * 2. isMobileMenuOpen (from HeaderMenuContext) controls mobile menu
 *    visibility, toggled by the hamburger button
 * 3. resortName is passed as a prop from app/visitor/layout.jsx (a
 *    Server Component, so it can read the singleton SystemSettings
 *    row) — this Client Component can't fetch it directly. Editable
 *    by the super-admin under Content > Homepage > Brand Identity.
 */
"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useHeaderMenu } from "./HeaderMenuContext";
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
  { label: "Activities", href: "/visitor/activities" },
  { label: "Gallery", href: "/visitor/gallery" },
  { label: "Policies", href: "/visitor/policies" },
  { label: "Directions", href: "/visitor/directions" },
  { label: "Contact", href: "/visitor#contact" },
];

export default function Header({ resortName = "your-private-resort" }) {
  const { isMobileMenuOpen, toggleMobileMenu, closeMobileMenu } = useHeaderMenu();
  const headerRef = useRef(null);

  // Keeps --header-height in sync with the header's actual rendered
  // height. Previously .visitorContent used a hardcoded 68px guess,
  // which didn't match the real height and left a gap (or a hidden
  // strip) between the fixed header and the page content below it.
  // ResizeObserver re-measures automatically if the header's height
  // ever changes (e.g. font loading, viewport width changes).
  useEffect(() => {
    const headerElement = headerRef.current;
    if (!headerElement) return;

    function updateHeaderHeightVariable() {
      document.documentElement.style.setProperty("--header-height", `${headerElement.offsetHeight}px`);
    }

    updateHeaderHeightVariable();

    const resizeObserver = new ResizeObserver(updateHeaderHeightVariable);
    resizeObserver.observe(headerElement);
    return () => resizeObserver.disconnect();
  }, []);

  return (
    <header ref={headerRef} className="siteHeader">
      <div className="headerContainer">
        {/* Logo */}
        <Link href="/visitor" className="headerLogo">
          {resortName}
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
              not a filled button) so it never competes with the Book Now CTA.
              Always rendered, even during maintenance — this exact element
              is `inert` (dead) then, but MaintenanceLoginLink.jsx measures
              its position and overlays a real clickable Login in the same
              spot, so nothing needs to be hidden here. */}
          <Link href="/superAdmin/login" className="headerLoginLink">
            Login
          </Link>

          {/* Book Now CTA — desktop. Scrolls to the homepage's "How to Book"
              availability calendar (HowToBookSection) rather than jumping
              straight to the standalone booking form, so visitors pick
              their dates first. */}
          <Link href="/visitor#how-to-book" className="headerBookButton">
            Book Now
          </Link>
        </div>

        {/* Hamburger — mobile only */}
        <button
          className="headerHamburger"
          aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
          aria-expanded={isMobileMenuOpen}
          onClick={toggleMobileMenu}
        >
          {isMobileMenuOpen ? (
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
      {isMobileMenuOpen && (
        <nav className="headerMobileMenu" aria-label="Mobile navigation">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="headerMobileNavLink"
              onClick={closeMobileMenu}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/visitor#how-to-book"
            className="headerMobileBookButton"
            onClick={closeMobileMenu}
          >
            Book Now
          </Link>
          <Link
            href="/superAdmin/login"
            className="headerMobileLoginLink"
            onClick={closeMobileMenu}
          >
            Login
          </Link>
        </nav>
      )}
    </header>
  );
}