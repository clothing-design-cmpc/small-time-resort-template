/**
 * FILE: components/shared/Footer.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Site footer with three columns: quick links, contact info, and tagline.
 * Copyright notice at the bottom. Matches the dark tone of the header.
 * Contact column now also renders a small pin map of the resort's
 * location underneath the address.
 *
 * DATA FLOW:
 * 1. Rendered inside app/visitor/layout.jsx below {children}
 * 2. Server Component reads the singleton SystemSettings row directly
 *    via Prisma (same pattern components/About.jsx already uses) —
 *    resortPhone / resortEmail / resortAddress / resortLatitude /
 *    resortLongitude are editable by the super-admin under Content >
 *    Policies & Content > Contact Info, and reflect here immediately
 *    on next page load (no caching in front of this read)
 * 3. Falls back to the original placeholder phone/email/address text
 *    per-field if the admin hasn't filled a given field in yet, so
 *    this footer is never blank or broken
 * 4. Latitude/longitude always resolve to a value (schema-level
 *    defaults point at Metro Manila) so the map itself always renders
 *    something, even before the admin sets the real coordinates
 */
import Link from "next/link";
import { prisma } from "@/services/prisma";
import ResortLocationMap from "./ResortLocationMap";
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
  { label: "Rooms", href: "/visitor#rooms" },
  { label: "Amenities",      href: "/visitor#amenities" },
  { label: "Shop",           href: "/visitor#shop" },
  { label: "About Us",       href: "/visitor#about" },
  { label: "Activities",     href: "/visitor/activities" },
  { label: "Gallery",        href: "/visitor/gallery" },
  { label: "Contact",        href: "/visitor#contact" },
];

// Placeholder values shown only until the admin fills in the real
// contact info from Super-Admin > Policies & Content > Contact Info.
const PLACEHOLDER_PHONE = "+63 9XX XXX XXXX";
const PLACEHOLDER_PHONE_HREF = "tel:+639XXXXXXXXX";
const PLACEHOLDER_EMAIL = "hello@your-private-resort.com";
const PLACEHOLDER_ADDRESS = "Philippines";

export default async function Footer() {
  const currentYear = new Date().getFullYear();

  // Read the singleton settings row directly — same pattern as
  // components/About.jsx. .catch(() => null) means a DB hiccup falls
  // back to placeholders instead of breaking the whole footer.
  const settings = await prisma.systemSettings.findUnique({ where: { id: "singleton" } }).catch(() => null);

  const resortPhone = settings?.resortPhone || PLACEHOLDER_PHONE;
  const resortPhoneHref = settings?.resortPhone
    ? `tel:${settings.resortPhone.replace(/[^\d+]/g, "")}`
    : PLACEHOLDER_PHONE_HREF;
  const resortEmail = settings?.resortEmail || PLACEHOLDER_EMAIL;
  const resortAddress = settings?.resortAddress || PLACEHOLDER_ADDRESS;

  // Schema-level @default() on both columns means these are only ever
  // null if a row exists but someone explicitly cleared the fields —
  // fall back to the same Metro Manila placeholder coordinates in
  // that case so the map never has nothing to render.
  const resortLatitude = settings?.resortLatitude ?? 14.5995;
  const resortLongitude = settings?.resortLongitude ?? 120.9842;

  return (
    <footer className="siteFooter">
      <div className="footerContainer">
        {/* Column 1 — Brand + tagline */}
        <div className="footerBrand">
          <span className="footerLogoText">your-private-resort</span>
          <p className="footerTagline">
            An intimate private retreat in the province. One room, a small attentive team, and nothing else to distract you.
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
              <a href={resortPhoneHref} className="footerContactValue">{resortPhone}</a>
            </li>
            <li className="footerContactItem">
              <span className="footerContactLabel">Email</span>
              <a href={`mailto:${resortEmail}`} className="footerContactValue">{resortEmail}</a>
            </li>
            <li className="footerContactItem">
              <span className="footerContactLabel">Location</span>
              <span className="footerContactValue">{resortAddress}</span>
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

          {/* Pin map — driven entirely by resortLatitude/resortLongitude
              above, so editing the location in Super-Admin reflects
              here on next page load, no separate wiring needed. */}
          <ResortLocationMap
            latitude={resortLatitude}
            longitude={resortLongitude}
            resortName="your-private-resort"
          />
        </div>
      </div>

      {/* Bottom bar */}
      <div className="footerBottom">
        <div className="footerBottomContainer">
          <span className="footerCopyright">© {currentYear} your-private-resort. All rights reserved.</span>
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