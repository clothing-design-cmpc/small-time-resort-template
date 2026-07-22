/**
 * FILE: scripts/generateRecoveryCard.mjs
 * ROLE: Terminal-only — never imported by the app, never reachable
 *       over HTTP. Same "decoupled from live traffic" reasoning as
 *       scripts/generateEnvSecret.mjs and scripts/hashVaultPassphrase.js.
 *
 * PURPOSE:
 * Generates a small, printable HTML "recovery card" — a physical
 * fallback (kept in a safe, wallet, etc.) for the case where BOTH the
 * vault owner's email AND Google Drive are unreachable at the same
 * time, so neither of the normal ways to retrieve the current
 * passphrase and OTP is available.
 *
 * WHAT IT DELIBERATELY DOES NOT CONTAIN:
 * No actual passphrase, no actual OTP, no actual current vault URL
 * slug. The slug is derived from the passphrase hash
 * (services/vaultAuth.js's computeVaultUrlSlug()) and changes on
 * every rotation — printing today's real slug would make this card
 * stale the moment the passphrase next rotates, AND would put a
 * real, still-guessable-if-found secret on a piece of paper. Instead
 * this card prints the URL PATTERN with a placeholder in place of the
 * slug, plus the generic steps for where to actually find the current
 * slug and passphrase when the card is needed for real.
 *
 * USAGE:
 *   node scripts/generateRecoveryCard.mjs
 *
 * Writes vault-recovery-card.html to the project root (gitignored —
 * see .gitignore). Open it in a browser and use Print > Save as PDF
 * (or print it directly) — deliberately no new PDF-generation
 * dependency added to package.json just for this one offline-use
 * file; every modern browser already does this conversion for free.
 *
 * Re-run this whenever NEXT_PUBLIC_SITE_URL changes (e.g. moving to a
 * new domain) so the printed card's URL pattern stays accurate.
 */
import "./loadEnv.mjs";
import { writeFileSync } from "node:fs";

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://your-domain-here.com").replace(/\/$/, "");

// Deliberately a placeholder, never a real slug — see file header.
const urlPattern = `${siteUrl}/system-vault/[current-slug]/login`;

const generatedAtReadable =
  new Date().toLocaleString("en-US", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "UTC",
  }) + " UTC";

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Vault Recovery Card</title>
<style>
  /* Sized to fit a standard business card / index card when printed —
     kept deliberately simple since this exists to be read once, in a
     stressful moment, not to look polished. */
  @media print {
    @page { size: auto; margin: 0.5in; }
  }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    max-width: 480px;
    margin: 2rem auto;
    padding: 1.5rem;
    border: 2px solid #000;
    border-radius: 8px;
    color: #111;
  }
  h1 {
    font-size: 1.1rem;
    margin: 0 0 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .urlPattern {
    font-family: monospace;
    font-size: 0.85rem;
    background: #f2f2f2;
    padding: 0.5rem;
    border-radius: 4px;
    word-break: break-all;
  }
  ol {
    padding-left: 1.2rem;
    font-size: 0.9rem;
    line-height: 1.6;
  }
  .warning {
    font-size: 0.8rem;
    margin-top: 1rem;
    padding-top: 0.75rem;
    border-top: 1px solid #ccc;
    color: #444;
  }
  .footer {
    font-size: 0.7rem;
    color: #888;
    margin-top: 0.75rem;
  }
</style>
</head>
<body>
  <h1>Villa Azure Resort — Vault Recovery Card</h1>

  <p>Recovery URL pattern:</p>
  <p class="urlPattern">${urlPattern}</p>

  <ol>
    <li>Replace <strong>[current-slug]</strong> above with the slug from the most recent passphrase-rotation email (subject: "Your vault passphrase was rotated") in the vault owner's inbox, or from the matching .txt file in the Google Drive backup folder.</li>
    <li>Open that URL in a browser.</li>
    <li>Enter the current passphrase from that same email or Drive file.</li>
    <li>Enter the one-time code sent to the vault owner's email.</li>
    <li>You are now on the disaster-recovery dashboard.</li>
  </ol>

  <p class="warning">
    This card intentionally contains no live passphrase, OTP, or URL
    slug — those change on every rotation and are only ever available
    via email or Google Drive. This card is only useful for finding
    your way back to step 1 if you've forgotten the URL pattern
    itself. Store this card somewhere physically secure (a safe,
    locked drawer). Re-print it if NEXT_PUBLIC_SITE_URL ever changes.
  </p>

  <p class="footer">Generated ${generatedAtReadable}</p>
</body>
</html>
`;

const outputPath = "vault-recovery-card.html";
writeFileSync(outputPath, html, "utf-8");

console.log(`Recovery card written to ./${outputPath}`);
console.log("Open it in a browser and use Print > Save as PDF, or print it directly.");
console.log("Store the printed copy somewhere physically secure.");
