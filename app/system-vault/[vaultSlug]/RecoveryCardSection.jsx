/**
 * FILE: app/system-vault/[vaultSlug]/RecoveryCardSection.jsx
 * ROLE: Rendered inside RecoveryClient.jsx only — reachable only after
 *       the vault's own passphrase + OTP login chain (same as every
 *       other section on this page).
 *
 * PURPOSE:
 * Task 4 — moves the printable recovery card from a terminal-only
 * script (scripts/generateRecoveryCard.mjs, still kept for a
 * fully-offline fallback) into the vault dashboard itself, so the
 * owner can print it without touching a terminal. Clicking "Print
 * Recovery Card" opens the browser's print dialog scoped to just the
 * card below (see the @media print rules in RecoveryCard.css) —
 * everything else on the page is hidden from the printed output.
 *
 * WHAT IT DELIBERATELY DOES NOT CONTAIN (same rule as the script):
 * No actual passphrase, no actual OTP, no actual current vault URL
 * slug — those change on every passphrase rotation
 * (services/vaultAuth.js's computeVaultUrlSlug()) and printing
 * today's real slug would go stale the moment it next rotates, and
 * would put a still-guessable-if-found secret on paper. Only the URL
 * PATTERN with a placeholder, plus the steps for finding the current
 * slug and passphrase for real.
 *
 * NEW IN THIS VERSION — hidden page directory:
 * Per Task 4, the printed card also lists every page in the app that
 * is deliberately NOT linked from anywhere in the public site or the
 * normal admin nav, and what each one is for. This is a static list —
 * paths and purposes only, nothing that changes per rotation, nothing
 * secret — so someone with only the physical card (no working laptop
 * access to email or Drive) at least knows what exists and where to
 * start looking once they're back at a working device.
 * FIX — blank pages on print:
 * Previously this used `visibility: hidden` on `body *` to hide the
 * dashboard, then `position: absolute` to pull the print area out.
 * `visibility: hidden` keeps the hidden elements' layout space intact
 * (only their pixels disappear), so the full-height dashboard still
 * occupied its normal scroll height — the print engine allocated that
 * many blank pages before/around the card. Portaling the print area
 * to a direct child of <body> and hiding everything else with
 * `display: none` (removes the box from layout entirely, zero height)
 * fixes it — see the @media print rules in RecoveryCard.css.
 */
"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import "./RecoveryCard.css";

const HIDDEN_PAGES = [
  {
    path: "/system-vault-setup",
    purpose:
      "Bootstraps or rotates the vault passphrase. Reachable via the owner's normal admin session, or a VAULT_SETUP_KEY query string that needs no database read at all — the only way in after a database wipe clears admin_profiles.",
  },
  {
    path: "/system-vault/[current-slug]/login",
    purpose: "Vault login — enter the current passphrase. First of two factors.",
  },
  {
    path: "/system-vault/[current-slug]/otp",
    purpose: "Vault login, step two — enter the one-time code emailed to the vault owner.",
  },
  {
    path: "/system-vault/[current-slug]",
    purpose:
      "This dashboard: breach lockdown status and database restore, unban blocked IPs, environment check, Gatekeeper Tester, and the database-wipe danger zone.",
  },
  {
    path: "/security-breach",
    purpose: "Public notice shown to guests while a breach lockdown is active. Not linked from the site nav.",
  },
  {
    path: "/maintenance",
    purpose: "Public notice shown to everyone, including admins, while a post-wipe lockdown is active.",
  },
  {
    path: "/access-denied",
    purpose: "Shown to a visitor whose IP was blocked by a Gatekeeper. Not linked from the site nav.",
  },
  {
    path: "/logout",
    purpose: "Clears the admin session cookie and redirects to the admin login screen.",
  },
  {
    path: "/superAdmin",
    purpose:
      "The main admin dashboard (bookings, rooms, staff, shop, logs, backups). Not linked from the public visitor site.",
  },
];

export default function RecoveryCardSection() {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://your-domain-here.com").replace(/\/$/, "");
  const urlPattern = `${siteUrl}/system-vault/[current-slug]/login`;

  // The print area only exists in the DOM once this Client Component
  // has mounted in the browser — createPortal needs document.body,
  // which isn't available during server rendering.
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  function handlePrint() {
    window.print();
  }

  const printArea = (
    // Rendered as a direct child of <body> (see the portal below) —
    // not nested inside the dashboard layout — so the @media print
    // rule in RecoveryCard.css can hide every OTHER body child with a
    // simple display:none, and this element renders in normal page
    // flow with no leftover blank space from the rest of the app.
    <div className="recoveryCardPrintArea" id="recovery-card-print-root">
      <h1>Vault Recovery Card</h1>

      <p>Recovery URL pattern:</p>
      <p className="recoveryCardUrlPattern">{urlPattern}</p>

      <ol>
        <li>
          Replace <strong>[current-slug]</strong> above with the slug from the most recent
          passphrase-rotation email in the vault owner&apos;s inbox, or the matching file in the Google
          Drive backup folder.
        </li>
        <li>Open that URL in a browser.</li>
        <li>Enter the current passphrase from that same email or Drive file.</li>
        <li>Enter the one-time code sent to the vault owner&apos;s email.</li>
        <li>You are now on this recovery dashboard.</li>
      </ol>

      <h2>Hidden Pages Directory</h2>
      <table className="recoveryCardTable">
        <thead>
          <tr>
            <th>Path</th>
            <th>Purpose</th>
          </tr>
        </thead>
        <tbody>
          {HIDDEN_PAGES.map((page) => (
            <tr key={page.path}>
              <td className="adminMono">{page.path}</td>
              <td>{page.purpose}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="recoveryCardWarning">
        This card intentionally contains no live passphrase, OTP, or URL slug — those change on every
        rotation and are only ever available via email or Google Drive. Store this card somewhere
        physically secure (a safe, locked drawer). Re-print it whenever NEXT_PUBLIC_SITE_URL changes or a
        hidden page is added or removed.
      </p>
    </div>
  );

  return (
    <div className="recoveryStepCard">
      <h2>Printable Recovery Card</h2>
      <p>
        A physical fallback for when both email and Google Drive are unreachable. Contains no live passphrase,
        OTP, or URL slug — only the URL pattern and a directory of every hidden page in the app.
      </p>
      <button type="button" className="recoveryUnbanButton" onClick={handlePrint}>
        Print Recovery Card
      </button>

      {isMounted ? createPortal(printArea, document.body) : null}
    </div>
  );
}
