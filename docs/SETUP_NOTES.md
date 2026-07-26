# Step 5 Setup Notes — tasks 2-8

Nothing in the repo's code was changed — everything below is external
dashboard configuration or a local terminal command.

## EmailJS (tasks 2 & 3)
Dashboard: https://dashboard.emailjs.com
- Account → API Keys → EMAILJS_PUBLIC_KEY / EMAILJS_PRIVATE_KEY (Strict Mode)
- Email Services → EMAILJS_SERVICE_ID
- Template 1 (general) → paste docs/emailjs-templates/template-1-general.html
  into Edit Content → HTML → copy its template ID into EMAILJS_GENERAL_TEMPLATE_ID
- Template 2 (booking, new/separate template) → paste
  docs/emailjs-templates/template-2-booking.html → copy ID into
  EMAILJS_BOOKING_TEMPLATE_ID

## GitHub Actions (task 4)
https://github.com/settings/tokens → Generate new token (classic)
- Scopes: repo + workflow
- GITHUB_ACTIONS_TOKEN, GITHUB_REPO_OWNER, GITHUB_REPO_NAME,
  GITHUB_WORKFLOW_REF=static

## MaxMind GeoIP (task 5)
https://www.maxmind.com/en/geolite2/signup
- Free account → My Account → Manage License Keys → Generate new license key
- Download GeoLite2 City (.mmdb, not CSV)
- Save to services/geoip/GeoLite2-City.mmdb
- MAXMIND_DB_PATH already defaults to that path

## Vault & Gatekeeper security (task 6)
Run locally, no signup:
```bash
node scripts/generateEnvSecret.mjs
```
Prints VAULT_SETUP_KEY and CRON_SECRET. Also set VAULT_OWNER_EMAIL and,
optionally, VAULT_ALERT_WEBHOOK_URL.

Separate one-time local-machine command (Step 7 of the wizard):
```bash
node scripts/setupVault.js "your-chosen-passphrase-min-12-chars"
```
Scan vault-totp-qr.png with your authenticator app, then delete the file.

## Gemini + Google Maps Platform (task 7)
- Gemini: https://aistudio.google.com/apikey → Get API key → Create API key
  → GEMINI_API_KEY (restrict to Gemini API if flagged "Unrestricted")
- Maps/Weather: https://console.cloud.google.com → same project →
  APIs & Services → Library → enable Geocoding API, Routes API, Weather API
  → Credentials → Create API Key → restrict to those 3 APIs
  → same value works for GOOGLE_MAPS_API_KEY and GOOGLE_WEATHER_API_KEY

## Site configuration (task 8)
No signup — your own deployed URL:
```bash
NEXT_PUBLIC_SITE_URL=https://your-deployed-domain.com
```
BASE_URL only needed if a background script needs the site URL outside
the Next.js request context.
