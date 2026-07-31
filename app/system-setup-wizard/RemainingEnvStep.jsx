/**
 * FILE: app/system-setup-wizard/RemainingEnvStep.jsx
 * ROLE: Client Component — Step 4 of the setup wizard
 *
 * PURPOSE:
 * Renders once AdminSetupStep confirms Step 3 (super-admin created).
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
 * unlike Step 2's database commands, there's nothing to run in order
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
 *    (Step 5 — scripts & health checks), same hand-off pattern
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
      "Step A — sign in: go to dash.cloudflare.com and sign in (or click \"Sign Up\" if you don't have an account yet — free, just email + password).",
      "Step B — find R2: on the left sidebar, scroll down until you see \"R2 Object Storage\" and click it. The very first time, it'll ask you to enable R2 — this needs a payment method on file (a real card), but the free tier below covers a project this size, so you won't actually be charged for normal use.",
      "Step C — create the bucket: click the blue \"Create bucket\" button. Type a name — this becomes permanent and can't be renamed later, so pick carefully (e.g. villa-azure-resort, all lowercase, no spaces). Leave \"Location\" as Automatic and \"Default Storage Class\" as Standard — don't change these. Click \"Create bucket\" at the bottom.",
      "Step D — copy the Account ID: click \"R2 Object Storage\" in the sidebar again to go back to the overview page. Scroll down until you see \"Account Details\". Find \"Account ID\" and click the small copy icon next to it. Paste that into CLOUDFLARE_R2_ACCOUNT_ID in .env.local.",
      "Step E — start creating the API token: still in that same \"Account Details\" section, find \"API Tokens\" and click \"Manage API Tokens\" (or just \"Manage\"). Click \"Create Account API token\" — make sure it says \"Account\" API token, NOT \"User\" API Token (Account tokens keep working even if you ever leave the organization later).",
      "Step F — set what the token can do: under \"Permissions\", set it to \"Object Read & Write\". Below that, under \"Specify bucket(s)\", choose \"Apply to specific buckets only\" and check the bucket you made in Step C — this means if this token ever leaks, it can only touch this one bucket, nothing else in your account. Leave TTL (expiration) as \"Forever\" unless you specifically want it to expire later.",
      "Step G — create and copy: scroll down and click \"Create Account API Token\". A screen appears showing an Access Key ID and a Secret Access Key — copy BOTH right now, the Secret Access Key is only ever shown this one time and can never be viewed again after you leave this page. Paste Access Key ID into CLOUDFLARE_R2_ACCESS_KEY_ID and Secret Access Key into CLOUDFLARE_R2_SECRET_ACCESS_KEY.",
      "Step H — set the bucket name variable: go back to .env.local and set CLOUDFLARE_R2_BUCKET_NAME to the exact same name you typed in Step C (case-sensitive, must match exactly).",
      "Step I — make the bucket public: click into your bucket (R2 Object Storage → click the bucket's name in the list) → click the \"Settings\" tab at the top → scroll to \"Public Development URL\" → click \"Enable\".",
      "Step J — copy the public URL: right after enabling, a URL appears that looks like https://pub-xxxxxxxxxx.r2.dev — copy it exactly as shown, starting with https:// and with NO trailing slash at the end. Paste that into NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL. (There's also a \"Custom Domains\" option just above it on that same page — that's for connecting your own domain name later for production; skip it for now, the pub-....r2.dev URL works fine to get started.)",
    ],
  },
  emailjs: {
    links: [{ label: "EmailJS Dashboard", url: "https://dashboard.emailjs.com" }],
    steps: [
      "Step A — sign in: go to dashboard.emailjs.com and sign in (or sign up if new — free plan is enough to start).",
      "Step B — copy your keys: click \"Account\" in the left sidebar, then click \"API Keys\". You'll see \"Public Key\" and \"Private Key\". Copy the Public Key into EMAILJS_PUBLIC_KEY. For the Private Key, you first need to turn on \"Strict Mode\" (a toggle on this same page) — turn it on, then a Private Key appears; copy that into EMAILJS_PRIVATE_KEY.",
      "Step C — connect an email service: click \"Email Services\" in the left sidebar. If you don't have one yet, click \"Add New Email Service\" and connect your Gmail (or another provider) by following Google's sign-in popup. Once connected, copy the Service ID shown in the list into EMAILJS_SERVICE_ID.",
      "This project needs TWO separate templates — one general-purpose, one booking-only. Do not reuse one template's ID for the other; each one below has its own exact ID.",
      "TEMPLATE 1 (general) — step D: click \"Email Templates\" in the left sidebar, then \"Create New Template\". Give it any name you'll recognize, like \"General Notifications\". Copy the Template ID shown at the top of the editor into EMAILJS_GENERAL_TEMPLATE_ID.",
      "TEMPLATE 1 — step E, fill in the right-hand settings panel (visible while editing the template): Subject field → type exactly {{subject}}. To Email field → type exactly {{to_email}}. Reply To field → type exactly {{reply_to}}. From Name field → type a real, fixed name like \"your-private-resort\" (not a merge tag — this one stays the same every time). If there's a Bcc field showing {{email}} from the default template, delete that text and leave Bcc blank.",
      "TEMPLATE 1 — step F, switch to raw HTML: in the main editor area (not the right panel), find the \"Edit Content\" button, then look for a way to switch to HTML/code view (usually a \"</>\" icon or a \"Code Editor\" toggle) — the copyable block below this list is HTML, not the visual/rich-text editor. Delete whatever placeholder content is there and paste the whole \"Template 1\" block from below.",
      "TEMPLATE 1 — step G, double-check the tags: after pasting, the template must contain exactly these lowercase merge tags for the app to fill them in correctly (EmailJS is case-sensitive — a wrong-case tag silently renders blank instead of erroring): {{eyebrow}}, {{heading}}, {{intro}}, {{highlight_line_1}}, {{highlight_line_2}}, and {{{body_message}}} (three curly braces on that last one specifically — it outputs raw line breaks instead of escaping them). If you started from EmailJS's own default template, watch out for a leftover uppercase {{EYEBROW}} — that must be lowercased to {{eyebrow}} or it'll always show empty.",
      "TEMPLATE 2 (booking) — step H: click \"Email Templates\" → \"Create New Template\" again — a brand new one, don't clone or reuse Template 1, this one needs different tags. Copy its Template ID into EMAILJS_BOOKING_TEMPLATE_ID.",
      "TEMPLATE 2 — step I, same right-hand panel fields as Template 1: Subject = {{subject}}, To Email = {{to_email}}, Reply To = {{reply_to}}, From Name = the same fixed brand name you used before.",
      "TEMPLATE 2 — step J, switch to HTML view the same way as Template 1's step F, then paste the \"Template 2\" block from below. This one uses regular double-brace tags only (no triple-brace needed): {{submitted_at}}, {{booking_id}}, {{guest_name}}, {{guest_pax}}, {{guest_phone}}, {{guest_email}}, {{room}}, {{package}}, {{check_in}}, {{check_out}}, {{price}}, {{downpayment}}, {{balance}}, {{payment_status}}, and {{special_requests}}.",
      "Step K — save everything: click \"Save\" on both templates. Then confirm Strict Mode is switched on (Account → Security tab) — this is what makes the Private Key from step B actually required and valid, so this server-side call can't be replayed by someone who only has the Public Key.",
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
<p style="margin: 0 0 6px; font-family: 'Georgia',serif; font-size: 13px; color: #d4a574; letter-spacing: 0.1em; text-transform: uppercase;">your-private-resort</p>
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
      <p class="brand">your-private-resort</p>
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
    <p class="sign">— your-private-resort Team</p>
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
      "Step A — open the token page: click the link above (or go to github.com/settings/tokens while logged into GitHub). Click the \"Generate new token\" button, then from the dropdown choose \"Generate new token (classic)\" specifically — NOT the fine-grained option. Fine-grained tokens can look fully configured yet silently fail to trigger the backup workflow, so classic is required here.",
      "Step B — name and expiration: give it a note/name you'll recognize later, like \"backup-restore-pipeline\". For Expiration, pick \"No expiration\" (or a long date) — if it expires unnoticed, the nightly backup silently stops running.",
      "Step C — check the scopes: scroll down to the list of checkboxes. Check the box next to \"repo\" (this also auto-checks all its sub-items — that's fine, leave them checked). Then separately find and check \"workflow\" too — both boxes are required; missing \"workflow\" specifically means the token can log in fine but every attempt to actually run the backup workflow gets rejected.",
      "Step D — generate and copy: scroll to the bottom and click \"Generate token\". The token text appears ONCE on the next page — copy it immediately (click the small copy icon next to it) and paste it into GITHUB_ACTIONS_TOKEN in .env.local. If you navigate away before copying, you can't see it again and have to generate a new one.",
      "Step E — fill in the repo details: GITHUB_REPO_OWNER is your GitHub username or organization name (the part right after github.com/ in this repository's URL). GITHUB_REPO_NAME is the repository name itself (the part right after that). GITHUB_WORKFLOW_REF is the branch name the workflow files live on — currently \"static\" for this project, so set it to that exact word.",
    ],
  },
  rateLimit: {
    links: [{ label: "Upstash Console", url: "https://console.upstash.com" }],
    steps: [
      "Step A — go to console.upstash.com and click \"Sign in\" (or \"Sign up\" if it's your first time). Click \"Continue with Google\" and log in with your Gmail account — fastest option, no separate password to remember.",
      "Step B — in the left sidebar, click \"Redis\" — this is Upstash's Redis product page, where your databases get listed (empty the first time you open it).",
      "Step C — click the \"Create Database\" button. Type a name you'll recognize (e.g. villa-azure-ratelimit). Set Type to \"Regional\" (not \"Global\" — Regional is what the free tier covers and is enough for this project).",
      "Step D — before clicking Create, find the \"Primary Region\" dropdown on that same form. In a separate browser tab, open your Supabase Dashboard → Settings → General, and note the \"Region\" shown there. Back in the Upstash tab, open the Primary Region dropdown and pick that exact same region — this keeps Redis and your Postgres database physically close, which avoids extra delay on every rate-limited request.",
      "Step E — click the \"Create\" button at the bottom of that form. The database finishes setting up almost instantly (a few seconds).",
      "Step F — click into the database you just created (click its name in the list). Find the \"REST API\" section on that page. You'll see two values there — copy \"UPSTASH_REDIS_REST_URL\" and paste it into .env.local, then copy \"UPSTASH_REDIS_REST_TOKEN\" and paste that in too.",
      "No further setup needed — services/rateLimit.js automatically switches from its in-memory fallback to this distributed limiter the moment both values are present and the dev server is restarted.",
    ],
  },
  geoip: {
    links: [{ label: "MaxMind GeoLite2 Signup", url: "https://www.maxmind.com/en/geolite2/signup" }],
    steps: [
      "Step A — go to the MaxMind signup link above and create a free account (email + password, confirm your email if asked).",
      "Step B — once logged in, click \"My Account\" (top-right), then \"Manage License Keys\" from the menu on the left. Click \"Generate new license key\". Fill in a name/description if asked, then confirm. You don't need to copy this key anywhere in .env.local — it's just needed to unlock the download in the next step.",
      "Step C — click \"Download Files\" (also in that left-hand account menu). Find \"GeoLite2 City\" in the list — make sure you download the one labeled \".mmdb\" (binary database), NOT the \".csv\" version, which is a different format the app can't read.",
      "Step D — the download is a zipped folder. Unzip it, and inside you'll find a file ending in .mmdb. Rename it to exactly GeoLite2-City.mmdb if it isn't already, then move/copy that file into this project's services/geoip/ folder (create that folder if it doesn't exist yet).",
      "Step E — set MAXMIND_DB_PATH in .env.local to services/geoip/GeoLite2-City.mmdb (this is already the default the app expects, so you likely don't need to change anything if you placed the file exactly where step D says).",
      "Step F — remember to repeat steps C and D every couple of weeks: MaxMind refreshes the GeoLite2 database roughly every 2 weeks with updated location data, and the app doesn't auto-update it — you just re-download and replace the same file.",
    ],
  },
  vaultSecurity: {
    links: [],
    steps: [
      "Step A — open a terminal in your project: these two values don't need any website signup, they're generated on your own computer. In your code editor (or Start menu → search \"Terminal\" or \"Command Prompt\" on Windows, \"Terminal\" on Mac), open a terminal window and make sure it's sitting in your project folder (type cd followed by the folder path if it isn't, or right-click the project folder and choose \"Open in Terminal\" if your file explorer offers that).",
      "Step B — run the generator: type node scripts/generateEnvSecret.mjs and press Enter. It prints two lines of output — one for VAULT_SETUP_KEY and one for CRON_SECRET. Copy each value into the matching line in .env.local. (You can also pass just one name, like node scripts/generateEnvSecret.mjs VAULT_SETUP_KEY, if you only need to regenerate a single one later.)",
      "VAULT_SETUP_KEY reaches /system-vault-setup even after a full database wipe, when there's no admin session left. Never expires or auto-rotates — treat it like a master password.",
      "CRON_SECRET authenticates the nightly automated call to /api/system-vault-setup/auto-rotate. Update it in BOTH .env.local AND your deployment platform's env vars at the same time — a mismatch fails the cron job silently with a 401.",
      "Set VAULT_OWNER_EMAIL to the email that should receive vault alerts (just type in a real email address you can check — no special setup needed for this one). VAULT_ALERT_WEBHOOK_URL (optional) is a Slack/Discord-style incoming webhook URL, if you want alerts posted to a channel too — skip it if you don't have one.",
      "Set GATEKEEPER_IP_BLOCK_ENABLED=true — recommended default for every new client scaffold. It's off by default in proxy.js because it once locked a developer out of their own IP mid-testing; the /system-vault/ recovery page and vault API are permanently exempt from this block so you can never lock yourself out of the one page that can undo it, but the rest of the site (visitor pages, admin dashboard) can still block your IP if you trip a gatekeeper while testing the Danger Zone wipe flow or similar. If that happens, go to /system-vault/ to unblock your own IP from the Blocked IPs list.",
      "Step C — restart the dev server: save .env.local, then go to the terminal tab where npm run dev is running, press Ctrl+C to stop it, and run npm run dev again. Next.js only reads env vars once when it starts, so VAULT_SETUP_KEY, CRON_SECRET, and VAULT_OWNER_EMAIL won't actually take effect until you do this, even though the file is already saved.",
      "Step D — open a second terminal: leave the first terminal running npm run dev, untouched. Open a brand new terminal tab or window (same project folder) — this second one is where you'll run the command below. No vault passphrase registered yet? There's no scheduled cron running locally to auto-generate the first one, so this manual command does that job by hand.",
      "Step E — run the auto-rotate command below, in that second terminal, while npm run dev is still running in the first. It treats \"no VaultPassphrase row yet\" the same as \"expired,\" so it generates, emails (to VAULT_OWNER_EMAIL), and backs up (to R2) the very first passphrase immediately, no 30-day wait.",
      "On Windows PowerShell specifically: PowerShell's built-in \"curl\" is actually an alias for Invoke-WebRequest, and its -Headers parameter needs a real PowerShell hashtable (@{ Name = \"value\" }) — not real curl's \"Header: value\" text syntax. Passing the macOS/Linux command's -H \"Authorization: Bearer ...\" text as-is throws a type-conversion error (something like \"Cannot convert value ... to type IDictionary\"). Use the PowerShell-native command below instead — it's already written in hashtable syntax, no typing needed.",
      "Also on Windows PowerShell 5.1 (the version that ships with Windows by default — check with $PSVersionTable.PSVersion): Invoke-WebRequest can additionally throw \"The response content cannot be parsed because the Internet Explorer engine is not available\" if IE's first-run setup was never completed on that machine. The command below already includes -UseBasicParsing, which skips that IE dependency entirely and avoids the error — no other setup needed. PowerShell 7+ doesn't have this issue, but the flag is harmless there too.",
      "What success looks like: either command prints a JSON body back to the terminal. {\"success\":true,\"data\":{\"rotated\":true},...} means a fresh passphrase was just generated, emailed to VAULT_OWNER_EMAIL, and backed up to R2 — check that inbox next. {\"success\":true,\"data\":{\"rotated\":false},...} means one was already on file and not yet due for rotation. {\"success\":false,\"message\":\"Unauthorized.\"} with a 401 means CRON_SECRET in .env.local doesn't match what you pasted into the command — recheck it and make sure the dev server was restarted after saving .env.local (see Step C above).",
    ],
    codeBlocksIntro:
      "The three commands below all go into a terminal — Command Prompt, PowerShell, or Git Bash on Windows; Terminal on macOS/Linux — opened at your project's root folder (the same folder that contains package.json). The first one is a one-time setup command; the other two are the auto-rotate request, run in a second terminal tab/window while npm run dev keeps running in the first.",
    codeBlocks: [
      {
        label: "Run in your terminal, from the project root",
        code: "node scripts/generateEnvSecret.mjs",
      },
      {
        label: "macOS / Linux / Git Bash / cmd.exe — replace YOUR_CRON_SECRET with the value from .env.local",
        code: "curl -H \"Authorization: Bearer YOUR_CRON_SECRET\" http://localhost:3000/api/system-vault-setup/auto-rotate",
      },
      {
        label: "Windows PowerShell — same request, PowerShell-native syntax (replace YOUR_CRON_SECRET with the value from .env.local)",
        code: "Invoke-WebRequest -UseBasicParsing -Uri \"http://localhost:3000/api/system-vault-setup/auto-rotate\" -Headers @{ Authorization = \"Bearer YOUR_CRON_SECRET\" }",
      },
    ],
  },
  aiInsightAndDirections: {
    links: [
      { label: "Google AI Studio (Gemini)", url: "https://aistudio.google.com/apikey" },
      { label: "Google Cloud Console (Maps + Weather)", url: "https://console.cloud.google.com" },
    ],
    steps: [
      "Gemini: in AI Studio, click \"Get API key\" then \"Create API key\". Import an existing Google Cloud project or create a new one — no billing account required for Gemini. Copy the key into GEMINI_API_KEY.",
      "Keys created in AI Studio in 2026 are auth keys by default — prefixed \"AQ.\" instead of \"AIza\", already scoped to the Gemini API. If you land on an older \"AIza\" standard key, restrict it to Gemini API immediately if it's unrestricted, and regenerate a fresh AQ. key when you can — standard keys stop working entirely in September 2026.",
      "GEMINI_MODEL is optional — leave unset to default to gemini-flash-latest.",
      "Maps + Weather, step A — pick the right project: at console.cloud.google.com, look at the very top of the page, next to the \"Google Cloud\" logo, there's a small dropdown showing a project name. Click it and pick the SAME project you used for Gemini above (don't create a new one — one project, one bill, less to manage).",
      "Maps + Weather, step B — open the Maps Platform setup page: in the search bar at the top of the page, type \"Google Maps Platform\" and click the first result. If you land on a page titled \"Welcome, [your name]\" with questions like \"What's your industry of focus?\" — that's just Google asking for its own recommendations, not something this project needs. Click \"Skip for now\" (small link near the top of that popup) to close it. If it doesn't appear at all, that's fine too — continue to the next step.",
      "Maps + Weather, step C — the \"prepayment\" banner: you'll likely see an orange/yellow bar near the top saying something like \"Your free trial requires a prepayment.\" This just means Google needs a valid card on file before it lets you turn on paid-tier APIs — it will NOT charge that card unless you go far over the free monthly usage this project needs. Click the \"Make a payment\" (or \"Link a billing account\") button on that same bar, then follow Google's on-screen form: enter your card details, confirm, done. If the banner isn't there, billing may already be linked — skip to the next step.",
      "Maps + Weather, step D — open the API Library: click the ☰ menu icon at the very top-left of the page → scroll down and click \"APIs & Services\" → click \"Library\" (it's the second item in that submenu, right under \"Enabled APIs & services\").",
      "Maps + Weather, step E — enable each API one at a time: in the Library's search box, type the exact name below, click the matching result card, then click the blue \"Enable\" button on that page. If this project has no billing account linked yet, clicking Enable redirects you to a full \"Create a new billing account\" page instead of a simple dropdown — even if you already have a billing account on file from another project, Google doesn't offer to reuse it here. On that page: the \"Name\" field is pre-filled (e.g. \"My Maps Billing Account 1\") — leave it as-is or rename it, doesn't matter functionally. \"Country\" is usually already correct; \"Currency\" is set automatically based on that country and can't be changed. Click \"Continue\", then on the next screen enter a real card's details to finish creating the billing account — this does not charge the card, it just puts one on file as required before Google unlocks these paid-tier APIs; all four have a free monthly allowance well above what this project needs. Once that's done, you're automatically brought back to finish enabling the API you clicked. Then repeat for all FOUR names: \"Geocoding API\", \"Maps Static API\", \"Routes API\", \"Weather API\" (only the very first one triggers the billing account creation — the rest enable instantly once billing exists). Maps Static API is the easiest one to forget since nothing else on this page reminds you about it — skipping it won't show any error anywhere, it just means the little map picture on /visitor/directions never shows up. Do this step BEFORE step F below — creating the key first, with nothing enabled yet, causes a \"No APIs selected\" / \"API selection required\" error when you try to save it.",
      "Maps + Weather, step F — create the API key: click ☰ → \"APIs & Services\" → \"Credentials\" (right above \"Library\" in that same submenu). Click the blue \"+ Create Credentials\" button near the top, then click \"API key\" from the dropdown that appears. A panel slides in from the right showing a \"Name\" field (leave the default \"API key 1\" or rename it) — don't click Create yet, the next step still needs to happen on this same panel.",
      "Maps + Weather, step G — restrict the key: on that same panel, find \"Select API restrictions\" (currently says \"No APIs selected\") and click it — a checklist of every API enabled on this project appears (this list is empty and unusable if step E wasn't done first). Check the box next to all four: Geocoding, Maps Static, Routes, Weather. Unlike older Google Cloud versions, this Cloud Console no longer offers an \"unrestricted\"/\"don't restrict\" option — at least one API must be checked here or clicking Create fails with a red \"API selection required\" error. Scroll down past \"Application restrictions\" (leave it on \"None\" — that setting is for browser/app-level limits, separate from the API checklist above) and click \"Create\".",
      "Maps + Weather, step H — copy the key: clicking \"Create\" in step G takes you straight back to the Credentials page, where your new key (named \"Maps Platform API Key\" or whatever you typed) now shows up in the \"API keys\" list with a green checkmark, today's creation date, and \"4 APIs\" under Restrictions. There's no copy icon directly in that row — under the \"Actions\" column on the right, click \"Show key\". A popup opens showing the full key text in a box with a small copy icon next to it (hover over it, it says \"Copy to clipboard\") — click that icon, then paste into both GOOGLE_MAPS_API_KEY and GOOGLE_WEATHER_API_KEY in .env.local. Click \"Close\" when done.",
      "To find this same key again later (a new day, a different browser tab, whatever): go to console.cloud.google.com → click the ☰ menu icon top-left → \"APIs & Services\" → \"Credentials\" → your key is listed under \"API keys\" → \"Show key\" under Actions reopens the same copy popup from step H.",
      "One key value works for both GOOGLE_MAPS_API_KEY and GOOGLE_WEATHER_API_KEY — paste the exact same copied string into both .env.local lines, or repeat steps F–H a second time to generate two separately-restricted keys if you'd rather track each API's usage independently.",
      "To verify it worked: save both keys into .env.local, fully stop the dev server (Ctrl+C in that terminal) and run npm run dev again — env var changes don't apply on a hot-reload, only on a fresh start. Then open /visitor/directions in the browser. A small map image with the resort's location should render below the directions text — if that area stays blank, go back and double-check Maps Static API specifically (step E) is both enabled AND checked in the key's restrictions (step G), since that's the one API that fails silently with no visible error anywhere.",
    ],
  },
  siteConfig: {
    links: [],
    steps: [
      "No signup needed for this one — it's just telling the app its own web address, not connecting to any outside service.",
      "Step A — figure out your URL: while you're still developing locally, you might not have a real deployed domain yet. If so, you can temporarily leave this as http://localhost:3000 for now and come back to fix it once you actually deploy (e.g. to Vercel). Once you HAVE a real domain (like https://villaazure.com or the .vercel.app address Vercel gives you), that's the value to use.",
      "Step B — set it in two places: open .env.local and set NEXT_PUBLIC_SITE_URL to that URL (copy the exact code line below, then replace the example domain with your real one). Then do the same thing again in your deployment platform's environment variables settings (e.g. Vercel → your project → Settings → Environment Variables) — both places need the same value, since .env.local only affects your local machine, not the live site.",
      "BASE_URL is optional — only set it if a background script (something that runs outside of a normal page request) needs to know the site's URL. Most setups can leave this blank.",
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
        <span className="setupWizardEyebrow">Step 4 of 11</span>
        <h1 className="setupWizardTitle">Checking environment status…</h1>
      </div>
    );
  }

  if (loadError && !status) {
    return (
      <div className="setupWizardCard" role="alert">
        <span className="setupWizardEyebrow">Step 4 of 11</span>
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
        <span className="setupWizardEyebrow">Step 4 of 11</span>
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

                <ol className="setupWizardInstructionsList">
                  {REMAINING_ENV_HELP[group.id]?.steps.map((stepText, index) => (
                    <li key={index}>{stepText}</li>
                  ))}
                </ol>

                {REMAINING_ENV_HELP[group.id]?.codeBlocksIntro && (
                  <p className="setupWizardInstructionsNote">
                    {REMAINING_ENV_HELP[group.id].codeBlocksIntro}
                  </p>
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
          You can come back and finish these later — Step 5 doesn&apos;t
          require every key above to be set yet.
        </p>
        <button type="button" className="setupWizardButton" onClick={() => setContinued(true)}>
          Continue
        </button>
      </div>
    </div>
  );
}