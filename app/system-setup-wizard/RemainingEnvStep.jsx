/**
 * FILE: app/system-setup-wizard/RemainingEnvStep.jsx
 * ROLE: Client Component — Step 5 of the setup wizard
 *
 * PURPOSE:
 * Renders once AdminSetupStep confirms Step 4 (super-admin created).
 * Presence-only checklist for the 8 envGroups.mjs groups not already
 * covered by Step 2 (database, supabase): r2, emailjs, githubActions,
 * rateLimit, geoip, vaultSecurity, aiInsightAndDirections, siteConfig.
 * Together with Step 2, every one of the 10 envGroups.mjs groups is
 * surfaced somewhere in the wizard.
 *
 * Each group's "How do I get these?" panel now shows a clickable link
 * (or links, for groups that touch two providers) straight to the
 * dashboard/signup page, plus a numbered step-by-step list of what to
 * click and which .env key each value goes into — see
 * REMAINING_ENV_HELP below. This content is adapted from the vault
 * dashboard's own API & Service Setup Guide
 * (app/system-vault/[vaultSlug]/ApiSetupGuideSection.jsx) so a
 * first-run developer never has to leave the wizard to get the same
 * walkthrough the vault owner sees later — keep the two in sync when
 * either changes. ENV_FIX_INSTRUCTIONS from scripts/lib/envGroups.mjs
 * is intentionally left untouched here; it stays single-string because
 * scripts/runEnvCheck.js (the nightly cron alert email) still relies
 * on that exact shape.
 *
 * Some groups also carry an optional `codeBlocks` array — an actual
 * pasteable command or template, not just prose describing it. Each
 * entry has its own Copy button (same handleCopy/toast pattern
 * ExternalSetupStep.jsx already uses for terminal commands):
 *   - emailjs: the two EmailJS "Edit Content" HTML templates
 *     themselves, ready to paste in verbatim, instead of only a
 *     written description of which merge tags to place where.
 *   - vaultSecurity: the `node scripts/generateEnvSecret.mjs` command
 *     as its own copyable block, not just a sentence mentioning it.
 *   - siteConfig: a sample .env line for NEXT_PUBLIC_SITE_URL.
 *
 * This step has no sequential locking and no "I ran this" checkbox —
 * unlike Step 3's database commands, there's nothing to run in order
 * here, just external dashboard values to paste in. The person can set
 * these in any order, over multiple sessions if needed, since none of
 * them block each other.
 *
 * Also renders <ResellerArchitectureNote /> — a collapsed-by-default,
 * purely informational card on running this template for multiple
 * paying clients from one set of provider accounts. Checks nothing,
 * blocks nothing; see that component's own header for details.
 *
 * DATA FLOW:
 * 1. On mount and on every "Check again" click -> GET
 *    /api/system-setup-wizard/remaining-env-status
 * 2. Response drives the ✓/✕ badge per key, grouped by envGroups.mjs
 *    group id
 * 3. "Continue" is always available (these are external services, not
 *    build-blocking database steps) — hands off to <ScriptsHealthStep />
 *    (Step 6 — scripts & health checks), same hand-off pattern
 *    SetupKeyForm.jsx -> DatabaseSetupStep.jsx -> AdminSetupStep.jsx
 *    already uses
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import ScriptsHealthStep from "./ScriptsHealthStep";
import ResellerArchitectureNote from "./ResellerArchitectureNote";
import { useToast } from "./shared/useToast";
import ToastStack from "./shared/ToastStack";

/**
 * REMAINING_ENV_HELP
 * One entry per group.id from scripts/lib/envGroups.mjs (the 8 groups
 * this step covers). Each entry has the external dashboard/signup
 * link(s) to open and a numbered list of exactly what to click and
 * which .env key the copied value goes into. Content mirrors
 * ApiSetupGuideSection.jsx in the vault dashboard — update both places
 * together if a provider's flow changes.
 */
const REMAINING_ENV_HELP = {
  r2: {
    links: [{ label: "Cloudflare Dashboard", url: "https://dash.cloudflare.com" }],
    note:
      "Free tier: 10 GB storage + 1 million Class A (write/list) ops + 10 million Class B (read) ops per month — egress (serving files to visitors) is always free at any volume. Past the free tier: $0.015/GB-month storage, $4.50 per million Class A ops, $0.36 per million Class B ops. A single resort site rarely gets close to these numbers. This pool is shared across every bucket in the account, not per-bucket — if you later host multiple clients from one Cloudflare account (see \"Reselling this to multiple clients?\" below), all their buckets draw from the same pool; Cloudflare Dashboard → Billing shows current usage any time.",
    steps: [
      "Sign in, then enable R2 Object Storage (needs a payment method on file, but the free tier covers a project this size).",
      "Create a bucket: R2 Object Storage → Create bucket. Enter a name (e.g. villa-azure-resort — this is permanent, it can't be renamed later), leave Location as Automatic and Default Storage Class as Standard, then Create bucket.",
      "Copy the Account ID: R2 Object Storage → Overview → scroll down to Account Details → copy Account ID into CLOUDFLARE_R2_ACCOUNT_ID.",
      "Start the API token: same Account Details section → next to \"API Tokens\" click Manage → Create Account API token (not User API Token — Account tokens keep working even if you ever leave the org).",
      "Set its permissions: Permissions → Object Read & Write. Under \"Specify bucket(s)\" choose \"Apply to specific buckets only\" and select this bucket, so a leaked token can never touch any other bucket. TTL: Forever is fine unless you want it to auto-expire.",
      "Click Create Account API Token, then immediately copy the Access Key ID and Secret Access Key — the secret is shown only once — into CLOUDFLARE_R2_ACCESS_KEY_ID and CLOUDFLARE_R2_SECRET_ACCESS_KEY.",
      "Set CLOUDFLARE_R2_BUCKET_NAME to the exact bucket name from the create-bucket step above.",
      "Make it public: open the bucket → Settings tab → Public Development URL card → Enable.",
      "Copy the pub-....r2.dev URL it gives you (https://, no trailing slash) into NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL. (The Custom Domains card just above it is the production-ready alternative, if you have a domain to connect instead.)",
    ],
  },
  emailjs: {
    links: [{ label: "EmailJS Dashboard", url: "https://dashboard.emailjs.com" }],
    steps: [
      "Sign in, then Account → API Keys.",
      "Copy the Public Key into EMAILJS_PUBLIC_KEY and the Private Key (turn on Strict Mode) into EMAILJS_PRIVATE_KEY.",
      "Email Services → copy your connected service's ID into EMAILJS_SERVICE_ID.",
      "This project uses TWO separate templates — one general-purpose, one booking-only. Do not reuse one template's ID for the other.",
      "TEMPLATE 1 — general (contact inquiries, vault OTP, breach/rotation alerts): Email Templates → open the \"Contact template\" (or create one) and copy its ID into EMAILJS_GENERAL_TEMPLATE_ID.",
      "Template 1 right-hand panel: Subject = {{subject}}, To Email = {{to_email}}, Reply To = {{reply_to}}, From Name = a static brand name (e.g. \"Villa Azure\") since it isn't a merge tag this app fills, and clear the Bcc field if it still shows {{email}} from the default template.",
      "Template 1 Edit Content (raw HTML) must use exactly these lowercase merge tags — case must match services/emailjs.js exactly or EmailJS silently renders them blank: {{eyebrow}}, {{heading}}, {{intro}}, {{highlight_line_1}}, {{highlight_line_2}}, and {{{body_message}}} (triple braces — outputs raw HTML/line breaks instead of escaping them).",
      "Common mistake on Template 1: a leftover uppercase {{EYEBROW}} from the default template — merge tags are case-sensitive, so it must be lowercased to {{eyebrow}} or that field will always render empty.",
      "TEMPLATE 2 — booking confirmations only: Email Templates → Create New Template (do not clone/reuse Template 1 — this one has its own field set). Copy its ID into EMAILJS_BOOKING_TEMPLATE_ID.",
      "Template 2 right-hand panel: same as Template 1 — Subject = {{subject}}, To Email = {{to_email}}, Reply To = {{reply_to}}, From Name = a static brand name.",
      "Template 2 Edit Content must use these lowercase merge tags: {{submitted_at}}, {{booking_id}}, {{guest_name}}, {{guest_pax}}, {{guest_phone}}, {{guest_email}}, {{room}}, {{package}}, {{check_in}}, {{check_out}}, {{price}}, {{downpayment}}, {{balance}}, {{payment_status}}, and {{special_requests}} — all regular double braces, no raw-HTML tag needed for this one.",
      "Save both templates, then enable Strict Mode (Account → Security) and generate the Private Key referenced above so this server-side call can't be replayed from a leaked public key.",
    ],
    codeBlocks: [
      {
        label: "Template 1 — general (paste into Edit Content → HTML)",
        code: `<table style="background-color: #f0ece3; padding: 40px 0;" width="100%" cellspacing="0" cellpadding="0">
<tbody>
<tr>
<td align="center">
<table style="max-width: 600px; width: 100%; background-color: #ffffff; border-top: 4px solid #d4a574;" width="600" cellspacing="0" cellpadding="0"><!-- Header -->
<tbody>
<tr>
<td style="background-color: #1a2f4f; padding: 40px 48px 32px;" align="center">
<p style="margin: 0 0 6px; font-family: 'Georgia',serif; font-size: 11px; letter-spacing: 0.25em; text-transform: uppercase; color: #d4a574;">Private Resort &amp; Retreat</p>
<h1 style="margin: 0; font-family: 'Georgia',serif; font-size: 32px; font-weight: 400; letter-spacing: 0.08em; color: #ffffff;">VILLA AZURE</h1>
<p style="margin: 10px 0 0; font-family: 'Georgia',serif; font-size: 12px; letter-spacing: 0.15em; color: #a0b8c8; text-transform: uppercase;">Nasugbu, Batangas</p>
</td>
</tr>
<!-- Gold Divider -->
<tr>
<td style="background-color: #1a2f4f; padding: 0 0 40px;" align="center">
<table cellspacing="0" cellpadding="0">
<tbody>
<tr>
<td style="width: 40px; height: 1px; background-color: #d4a574;">&nbsp;</td>
<td style="width: 8px; height: 8px; background-color: #d4a574; border-radius: 50%; margin: 0 8px; display: inline-block;">&nbsp;</td>
<td style="width: 40px; height: 1px; background-color: #d4a574;">&nbsp;</td>
</tr>
</tbody>
</table>
</td>
</tr>
<!-- Intro Message -->
<tr>
<td style="padding: 48px 48px 0;">
<p style="margin: 0 0 6px; font-family: 'Georgia',serif; font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: #d4a574;">{{eyebrow}}</p>
<h2 style="margin: 0 0 20px; font-family: 'Georgia',serif; font-size: 22px; font-weight: 400; color: #1a2f4f; letter-spacing: 0.03em;">{{heading}}</h2>
<p style="margin: 0; font-family: 'Georgia',serif; font-size: 15px; line-height: 1.8; color: #5a5a5a;">{{intro}}</p>
</td>
</tr>
<!-- Divider Line -->
<tr>
<td style="padding: 32px 48px;"><hr style="border: none; border-top: 1px solid #e2ddd4; margin: 0;"></td>
</tr>
<!-- Message Card -->
<tr>
<td style="padding: 0 48px;">
<table style="background-color: #f5f1e8; border-left: 3px solid #d4a574;" width="100%" cellspacing="0" cellpadding="0">
<tbody>
<tr>
<td style="padding: 28px 32px;"><!-- Sender Info -->
<table style="margin-bottom: 24px;" cellspacing="0" cellpadding="0">
<tbody>
<tr>
<td>
<p style="margin: 0; font-family: 'Georgia',serif; font-size: 13px; color: #7ba8a8;">{{highlight_line_1}}</p>
<p style="margin: 2px 0 0; font-family: 'Georgia',serif; font-size: 12px; color: #9ca89f; letter-spacing: 0.05em;">{{highlight_line_2}}</p>
</td>
</tr>
</tbody>
</table>
<!-- Message Body -->
<p style="margin: 0; font-family: 'Georgia',serif; font-size: 15px; line-height: 1.85; color: #3a3a3a; white-space: pre-line;">{{{body_message}}}</p>
</td>
</tr>
</tbody>
</table>
</td>
</tr>
<!-- Divider Line -->
<tr>
<td style="padding: 32px 48px;"><hr style="border: none; border-top: 1px solid #e2ddd4; margin: 0;"></td>
</tr>
<!-- Footer -->
<tr>
<td style="background-color: #1a2f4f; padding: 32px 48px; text-align: center;">
<p style="margin: 0 0 6px; font-family: 'Georgia',serif; font-size: 13px; color: #d4a574; letter-spacing: 0.1em; text-transform: uppercase;">Villa Azure</p>
<p style="margin: 0 0 4px; font-family: 'Georgia',serif; font-size: 12px; color: #7ba8a8;">123 Azure Shores Drive, Nasugbu, Batangas 4231</p>
<p style="margin: 0 0 4px; font-family: 'Georgia',serif; font-size: 12px; color: #7ba8a8;">+63 917 123 4567 &nbsp;&middot;&nbsp; reservations@villaazure.com</p>
<p style="margin: 16px 0 0; font-family: 'Georgia',serif; font-size: 11px; color: #4a6a7a; letter-spacing: 0.05em;">Front Desk available 24 hours, 7 days a week.</p>
</td>
</tr>
</tbody>
</table>
</td>
</tr>
</tbody>
</table>`,
      },
      {
        label: "Template 2 — booking (paste into a new, separate template's Edit Content → HTML)",
        code: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>
    body { font-family: sans-serif; background: #f8fafc; margin: 0; padding: 24px; }
    .card { background: #ffffff; max-width: 560px; margin: 0 auto; border-radius: 10px; border: 1px solid #e2e8f0; padding: 32px; }
    .header { border-bottom: 2px solid #1a2f4f; padding-bottom: 16px; margin-bottom: 24px; }
    .brand { font-size: 11px; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; color: #b8975a; margin-bottom: 4px; }
    h2 { color: #1a2f4f; margin: 0 0 4px 0; font-size: 20px; }
    .subtitle { color: #64748b; font-size: 13px; margin: 0; }
    .greeting { font-size: 15px; color: #334155; margin: 0 0 20px 0; line-height: 1.6; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 9px 12px; font-size: 14px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
    td:first-child { font-weight: 600; color: #475569; width: 42%; }
    td:last-child { color: #1e293b; }
    .badge { display: inline-block; background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; border-radius: 4px; padding: 2px 8px; font-size: 12px; font-weight: 600; }
    .divider { border: none; border-top: 2px dashed #e2e8f0; margin: 28px 0; }
    .section-label { font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #94a3b8; margin: 0 0 12px 0; }
    .note { margin-top: 20px; font-size: 13px; color: #64748b; line-height: 1.6; }
    .sign { margin-top: 12px; font-size: 14px; color: #1a2f4f; font-weight: 600; }
    .footer { margin-top: 24px; font-size: 11px; color: #cbd5e1; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <!-- Header -->
    <div class="header">
      <p class="brand">Villa Azure Private Resort</p>
      <h2>New Booking Inquiry</h2>
      <p class="subtitle">Submitted on {{submitted_at}}</p>
    </div>
    <!-- Guest Greeting (visible to guest in CC) -->
    <p class="greeting">
      Hi <strong>{{guest_name}}</strong>, your reservation inquiry has been received.
      Our team will reach out shortly to confirm your booking.
    </p>
    <!-- Booking Summary -->
    <p class="section-label">Booking Summary</p>
    <table>
      <tr><td>Booking ID</td><td>{{booking_id}}</td></tr>
      <tr><td>Guest Name</td><td>{{guest_name}}</td></tr>
      <tr><td>No. of Pax</td><td>{{guest_pax}}</td></tr>
      <tr><td>Phone</td><td>{{guest_phone}}</td></tr>
      <tr><td>Email</td><td>{{guest_email}}</td></tr>
      <tr><td>Room</td><td>{{room}}</td></tr>
      <tr><td>Package</td><td>{{package}}</td></tr>
      <tr><td>Check-in</td><td>{{check_in}}</td></tr>
      <tr><td>Check-out</td><td>{{check_out}}</td></tr>
      <tr><td>Package Price</td><td>{{price}}</td></tr>
      <tr><td>Downpayment</td><td>{{downpayment}}</td></tr>
      <tr><td>Balance</td><td>{{balance}}</td></tr>
      <tr><td>Payment Status</td><td><span class="badge">{{payment_status}}</span></td></tr>
      <tr><td>Special Requests</td><td>{{special_requests}}</td></tr>
    </table>
    <hr class="divider" />
    <!-- Guest note -->
    <p class="note">
      If you have any questions, please contact us directly.
      This is an automated confirmation — please do not reply to this email.
    </p>
    <p class="sign">— Villa Azure Team</p>
    <p class="footer">VillaAzure Booking System — automated notification</p>
  </div>
</body>
</html>`,
      },
    ],
  },
  githubActions: {
    links: [{ label: "GitHub Personal Access Tokens", url: "https://github.com/settings/tokens" }],
    steps: [
      "Generate new token (classic) — classic, not fine-grained; fine-grained tokens can look fully configured yet silently fail to dispatch the workflow.",
      "Scopes: check BOTH \"repo\" and \"workflow\" — without \"workflow\" the token authenticates but every dispatch call is rejected.",
      "Copy the token (shown once) into GITHUB_ACTIONS_TOKEN.",
      "Set GITHUB_REPO_OWNER and GITHUB_REPO_NAME to match this repository, and GITHUB_WORKFLOW_REF to the branch the workflows live on (currently \"static\").",
    ],
  },
  rateLimit: {
    links: [{ label: "Upstash Console", url: "https://console.upstash.com" }],
    steps: [
      "Create Database → Regional type, region close to where the app is hosted. Free tier is enough for this project.",
      "Open the database → REST API section → copy UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.",
      "No further setup — services/rateLimit.js switches from its in-memory fallback to the distributed limiter automatically once both values are present.",
    ],
  },
  geoip: {
    links: [{ label: "MaxMind GeoLite2 Signup", url: "https://www.maxmind.com/en/geolite2/signup" }],
    steps: [
      "Create a free account, then My Account → Manage License Keys → Generate new license key.",
      "Download GeoLite2 City (the .mmdb file, not the CSV version) from the account's Download Files page.",
      "Save it to services/geoip/GeoLite2-City.mmdb, and set MAXMIND_DB_PATH to that path (default already matches).",
      "Re-download and replace the file periodically — MaxMind refreshes GeoLite2 roughly every 2 weeks.",
    ],
  },
  vaultSecurity: {
    links: [],
    steps: [
      "These are generated locally — no signup needed. Run: node scripts/generateEnvSecret.mjs — prints values for VAULT_SETUP_KEY and CRON_SECRET at once (or pass one name to generate just that key).",
      "VAULT_SETUP_KEY reaches /system-vault-setup even after a full database wipe, when there's no admin session left. Never expires or auto-rotates — treat it like a master password.",
      "CRON_SECRET authenticates the nightly automated call to /api/system-vault-setup/auto-rotate. Update it in BOTH .env.local AND your deployment platform's env vars at the same time — a mismatch fails the cron job silently with a 401.",
      "Set VAULT_OWNER_EMAIL to the email that should receive vault alerts. VAULT_ALERT_WEBHOOK_URL (optional) is a Slack/Discord-style incoming webhook URL, if you want alerts posted to a channel too.",
      "Restart npm run dev after saving these into .env.local — Next.js only reads env vars once at server start, so VAULT_SETUP_KEY, CRON_SECRET, and VAULT_OWNER_EMAIL won't actually take effect until the dev server restarts, even though the file is already saved.",
      "No vault passphrase registered yet? Locally there's no Vercel Cron to auto-generate the first one on its own schedule — trigger the same auto-rotate route by hand with the command below. It treats \"no VaultPassphrase row yet\" the same as \"expired,\" so it generates, emails (to VAULT_OWNER_EMAIL), and backs up (to R2) the very first passphrase immediately, no 30-day wait.",
    ],
    codeBlocks: [
      {
        label: "Run in your terminal, from the project root",
        code: "node scripts/generateEnvSecret.mjs",
      },
      {
        label: "After restarting npm run dev — replace YOUR_CRON_SECRET with the value from .env.local",
        code: "curl -H \"Authorization: Bearer YOUR_CRON_SECRET\" http://localhost:3000/api/system-vault-setup/auto-rotate",
      },
    ],
  },
  aiInsightAndDirections: {
    links: [
      { label: "Google AI Studio (Gemini)", url: "https://aistudio.google.com/apikey" },
      { label: "Google Cloud Console (Maps + Weather)", url: "https://console.cloud.google.com" },
    ],
    steps: [
      "Gemini: in AI Studio, click \"Get API key\" then \"Create API key\". Import an existing Google Cloud project or create a new one — no billing account required. Copy the key into GEMINI_API_KEY.",
      "Keys created in AI Studio from 2026 onward are auto-restricted — if a key shows \"Unrestricted\" on the API Keys page, click \"Restrict to Gemini API\" (Google rejects unrestricted keys starting June 19, 2026).",
      "GEMINI_MODEL is optional — leave unset to default to gemini-flash-latest.",
      "Maps + Weather: in Cloud Console, use the same project. APIs & Services → Library — enable Geocoding API, Routes API, and Weather API.",
      "APIs & Services → Credentials → Create Credentials → API Key (requires billing enabled, but all three APIs have a free monthly call allowance). Restrict the key to just those three APIs.",
      "One key value works for both GOOGLE_MAPS_API_KEY and GOOGLE_WEATHER_API_KEY — use the same string, or generate two separately restricted keys to track usage independently.",
    ],
  },
  siteConfig: {
    links: [],
    steps: [
      "No signup — this is your own deployed site's URL.",
      "Set NEXT_PUBLIC_SITE_URL to this site's live production URL in .env.local and your deployment platform's env vars.",
      "BASE_URL (optional) only needs setting if a background script needs the site's URL outside the Next.js request context.",
    ],
    codeBlocks: [
      {
        label: "Add to .env.local (and your deployment platform's env vars)",
        code: "NEXT_PUBLIC_SITE_URL=https://your-deployed-domain.com",
      },
    ],
  },
};

export default function RemainingEnvStep() {
  const [status, setStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isChecking, setIsChecking] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [openHelpGroupId, setOpenHelpGroupId] = useState(null);
  const [continued, setContinued] = useState(false);
  const { toasts, showToast, dismissToast } = useToast();

  /**
   * handleCopy
   * Copies a code block's content (an EmailJS template, a terminal
   * command, or a sample .env line) to the clipboard. Same
   * try/navigator.clipboard/catch pattern ExternalSetupStep.jsx uses
   * for its terminal commands, kept local here since this step has
   * its own group-scoped code blocks instead of a flat list.
   */
  async function handleCopy(code) {
    try {
      await navigator.clipboard.writeText(code);
      showToast("✓ Copied to clipboard.", "success");
    } catch {
      showToast("✕ Couldn't copy automatically — please copy it manually.", "error");
    }
  }

  /**
   * fetchStatus
   * Pulls presence-only status for the 8 remaining envGroups.mjs
   * groups. Never throws to the caller — failures surface as a
   * user-facing error message instead.
   *
   * isRecheck distinguishes a "Check again" click from the initial
   * mount load. On the initial load a failure can safely fall through
   * to the full-page error card (status is still null). On a recheck,
   * status already holds the last successful result — replacing the
   * whole card with an error would erase everything the person can
   * already see, so failures are surfaced as a toast instead while the
   * existing badges stay on screen untouched.
   */
  const fetchStatus = useCallback(async (isRecheck = false) => {
    if (isRecheck) {
      setIsChecking(true);
    } else {
      setIsLoading(true);
    }
    setLoadError(null);
    try {
      const response = await fetch("/api/system-setup-wizard/remaining-env-status", {
        cache: "no-store",
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        const message = result.message ?? "We couldn't check the environment status. Please try again.";
        if (isRecheck) {
          showToast(`✕ ${message}`, "error");
        } else {
          setLoadError(message);
        }
        return;
      }
      setStatus(result.data);
      if (isRecheck) {
        showToast("✓ Environment status refreshed.", "success");
      }
    } catch {
      const message = "We couldn't reach the server. Check your connection and try again.";
      if (isRecheck) {
        showToast(`✕ ${message}`, "error");
      } else {
        setLoadError(message);
      }
    } finally {
      if (isRecheck) {
        setIsChecking(false);
      } else {
        setIsLoading(false);
      }
    }
  }, [showToast]);

  useEffect(() => {
    fetchStatus(false);
  }, [fetchStatus]);

  /**
   * handleCheckAgain
   * Re-runs the presence check. Guards against double-clicks while a
   * check is already in flight. Note: since this route only reads
   * process.env, newly added .env.local keys won't show as "✓ Set"
   * here until the dev server is restarted — Node reads env files once
   * at startup, it does not hot-reload them.
   */
  function handleCheckAgain() {
    if (isChecking) return;
    fetchStatus(true);
  }

  if (isLoading && !status) {
    return (
      <div className="setupWizardCard" role="status">
        <span className="setupWizardEyebrow">Step 5 of 10</span>
        <h1 className="setupWizardTitle">Checking environment status…</h1>
      </div>
    );
  }

  if (loadError && !status) {
    return (
      <div className="setupWizardCard" role="alert">
        <span className="setupWizardEyebrow">Step 5 of 10</span>
        <h1 className="setupWizardTitle">Couldn&apos;t load environment status</h1>
        <p className="setupWizardError">{loadError}</p>
        <button type="button" className="setupWizardButton" onClick={handleCheckAgain}>
          Try again
        </button>
      </div>
    );
  }

  if (continued) {
    return <ScriptsHealthStep />;
  }

  return (
    <div className="setupWizardStepGroup">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <div className="setupWizardCard">
        <span className="setupWizardEyebrow">Step 5 of 10</span>
        <h1 className="setupWizardTitle">Remaining services</h1>
        <p className="setupWizardBody">
          Set these in <code>.env.local</code> (and your deployment
          platform&apos;s own environment variables for production) as you
          get to each one. None of these block each other — set them in
          any order, over as many sessions as you need.
        </p>

        {status.envStatus.groups.map((group) => (
          <div key={group.id} className="setupWizardEnvGroup">
            <span className="setupWizardEnvGroupLabel">{group.label}</span>
            <ul className="setupWizardEnvList">
              {group.items.map((item) => (
                <li key={item.key} className="setupWizardEnvItem">
                  <div className="setupWizardEnvItemHeader">
                    <span
                      className={`setupWizardStatusBadge ${
                        item.present ? "setupWizardStatusBadge--ok" : "setupWizardStatusBadge--missing"
                      }`}
                    >
                      {item.present ? "✓ Set" : item.required ? "✕ Missing" : "○ Optional"}
                    </span>
                    <code>{item.key}</code>
                  </div>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="setupWizardHelpToggle"
              onClick={() => setOpenHelpGroupId(openHelpGroupId === group.id ? null : group.id)}
            >
              {openHelpGroupId === group.id ? "Hide" : "How do I get these?"}
            </button>
            {openHelpGroupId === group.id && (
              <div className="setupWizardInstructions">
                <span className="setupWizardInstructionsLabel">{group.label}</span>
                {REMAINING_ENV_HELP[group.id]?.links.length > 0 && (
                  <div className="setupWizardInstructionsLinks">
                    {REMAINING_ENV_HELP[group.id].links.map((link) => (
                      <a
                        key={link.url}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="setupWizardLink"
                      >
                        {link.label} ↗
                      </a>
                    ))}
                  </div>
                )}
                {REMAINING_ENV_HELP[group.id]?.note && (
                  <div className="setupWizardInstructionsNote">{REMAINING_ENV_HELP[group.id].note}</div>
                )}

                {REMAINING_ENV_HELP[group.id]?.codeBlocks?.map((block) => (
                  <div key={block.label} className="setupWizardCodeBlockGroup">
                    <span className="setupWizardInstructionsLabel">{block.label}</span>
                    <div className="setupWizardCommandRow">
                      <code className="setupWizardCodeBlock setupWizardCodeBlock--multiline">{block.code}</code>
                      <button
                        type="button"
                        className="setupWizardCopyButton"
                        onClick={() => handleCopy(block.code)}
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                ))}

                <ol className="setupWizardInstructionsList">
                  {REMAINING_ENV_HELP[group.id]?.steps.map((stepText, index) => (
                    <li key={index}>{stepText}</li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        ))}

        <button
          type="button"
          className="setupWizardButtonSecondary"
          onClick={handleCheckAgain}
          disabled={isChecking}
        >
          {isChecking ? "Checking…" : "Check again"}
        </button>
        <p className="setupWizardHint">
          Just added a key to <code>.env.local</code>? Restart your dev
          server (stop it, then <code>npm run dev</code> again) before
          checking — Node only reads <code>.env.local</code> once at
          startup, so new keys won&apos;t show as set until it restarts.
        </p>
      </div>

      <ResellerArchitectureNote />

      <div className="setupWizardCard">
        <p className="setupWizardBody">
          You can come back and finish these later — Step 6 doesn&apos;t
          require every key above to be set yet.
        </p>
        <button type="button" className="setupWizardButton" onClick={() => setContinued(true)}>
          Continue
        </button>
      </div>
    </div>
  );
}