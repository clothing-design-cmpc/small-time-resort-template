# 3-Gatekeeper Breach Response — QA Testing Guide

Covers the feature built in `services/breachResponse.js` and wired into
`app/api/auth/login/route.js`, `app/api/bookings/route.js`, and
`proxy.js`. GK1 and GK2 are IP-scoped only (no site-wide lockdown); GK3
is the full-lockdown gatekeeper — see `services/breachResponse.js`'s
header comment for the exact differentiation. Three ways to test it:
the automated CLI checker (GK1 & GK2 only), the browser-based vault
cards (all 3 gatekeepers, no terminal needed), and the manual
walkthrough (for the one thing nothing else covers — impossible
travel).

> **Gatekeeper 3 no longer fires immediately on an anomalous login** —
> see `docs/gatekeeper-3-otp-challenge.md` for the email-OTP step now
> in front of it. Everything below still describes what eventually
> happens if that OTP challenge fails or times out.

**Never run any of these against production.** All three deliberately
trip real breach detectors — that's the whole point.

---

## 0. Browser-based testers (no terminal needed)

Both live inside the disaster-recovery vault itself — reach them the
same way you reach any other vault section: unlock
`/system-vault/<slug>` with the vault passphrase + emailed OTP
(`services/vaultAuth.js`). Neither has its own separate passphrase or
hidden URL — one vault, one login, same as everything else on that page.

**"Gatekeeper Tester" card (GK1 & GK2).** Same two checks as the CLI
script below, editable test IPs, results shown as a pass/fail
checklist right in the card. Test rows (`BlockedIp`/`BreachEvent`) are
**not** cleaned up automatically — they stay visible on the "Unban IP"
section of the same page until manually removed. See
`services/gatekeeperTester.js` for the exact logic and
`app/api/admin/gatekeeper-tester/route.js` for the vault-session gate.

**"Gatekeeper 3 Live Test" card (GK3).** Not a harmless dry run — GK3
only fires after a genuinely valid login, so this logs in twice with a
real QA super-admin account (credentials from `GATEKEEPER3_TEST_ADMIN_EMAIL`
/ `GATEKEEPER3_TEST_ADMIN_PASSWORD` in `.env.local`, server-side only),
simulating a new device the second time. On success it actually flips
the site into breach lockdown and rotates the real vault passphrase —
nothing reverts this automatically; use the same page's "End Lockdown"
action afterward. Does not cover impossible travel (see the manual
walkthrough's step 8 for that). See `services/gatekeeper3Tester.js` for
the exact logic and `app/api/admin/gatekeeper3-tester/route.js` for the
vault-session gate.

## 1. Automated CLI checker (GK1 & GK2 only)

```bash
BASE_URL=http://localhost:3000 npm run check:gatekeepers
```

Test IPs can be overridden if you need to dry-run against a specific
address (defaults to the reserved 203.0.113.x range):

```bash
BASE_URL=http://localhost:3000 TEST_IP_GATEKEEPER_1=203.0.113.55 npm run check:gatekeepers
```

What it does, in order:
1. Sends 4 wrong-password login attempts from a fake test IP
   (`203.0.113.11`, reserved for documentation/testing — RFC 5737) and
   confirms the 4th returns `429`.
2. Confirms a `BlockedIp` row and a `BreachEvent` row (`gatekeeper: 1`)
   were created, and that `SystemSettings.breachLockdown` stays **off**
   — GK1 is IP-scoped only, it must never take the whole site down.
3. Confirms the same test IP now gets `403` on a completely unrelated
   route (proves the middleware IP check works site-wide, not just on login).
4. Submits a booking with a classic SQL injection payload in
   `guestName` (a free-text field — this project's `sqlInjectionGuard.js`
   scans every string field, but `guestName` doesn't need to pass a
   format check like `guestEmail` does, so it's the reliable field to test through).
5. Confirms the booking is rejected (`400`) and a second `BreachEvent`
   row (`gatekeeper: 2`) was created.
6. **Does NOT clean up afterward** — the test `BlockedIp`/`BreachEvent`
   rows are left in the database on purpose, so they're visible on the
   vault's "Unban IP" section. Expected to be wiped along with
   everything else at the real pre-deployment hard reset.

Exit code is `0` if every check passed, `1` otherwise — safe to wire
into a CI step later if this project ever adds one.

**What this script does NOT cover** — test these another way instead:
- Gatekeeper 3 (anomalous admin login) — use the "Gatekeeper 3 Live
  Test" browser card (section 0 above) for the new-device trigger, or
  the manual walkthrough's step 8 for impossible travel.
- The recovery page UI (its URL is hash-derived and changes on every
  passphrase rotation — see services/vaultAuth.js's
  computeVaultUrlSlug()) — needs a real browser session.
- The EmailJS alert actually arriving — needs real `EMAILJS_*` credentials.

---

## 2. Manual walkthrough (everything, including the UI)

Run this after any change to the recovery page, the admin banner, or
the lockdown screen — things the automated script can't see.

1. **Push schema + install.** `npm install`, `npx prisma db push`,
   `npx prisma generate`, restart the dev server. The `EMAILJS_*` env
   vars can stay unset for this pass — the email step logs "skipping
   email" and continues without them.
2. **Sanity-check the site still loads.** `npm run dev`, then visit the
   homepage and any `/superAdmin` page normally. This confirms the
   `proxy.js` runtime change (Edge → Node.js) didn't break basic
   routing — the highest-risk change in this feature, so check it first.
3. **Trip Gatekeeper 1 by hand.** Go to `/superAdmin/login`, enter a
   wrong password 4 times. The 4th should return 429. Check
   `blocked_ips` and `breach_events` via `npx prisma studio`, and
   confirm the visitor homepage now shows the full lockdown screen
   (`components/shared/BreachLockdownScreen.jsx`), not just a banner.
4. **Confirm you're actually blocked.** Try loading any page — even the
   homepage — from the same browser. Expect a plain "Access denied" 403.
5. **Unblock yourself.** Use the vault's "Unban IP" section
   (`app/api/admin/blocked-ips/`) — log into `/system-vault/<slug>`,
   request a fresh view code, then a separate fresh unban code, and
   remove your test IP from there. No direct database access needed.
6. **Check the recovery page + admin banner.** Log back in as
   super-admin — the red `BreachAlertBanner` should show at the top of
   every admin page, with a link to the current recovery URL (never
   type it from memory — it changes every time the passphrase
   rotates). Open it (not in the Sidebar — only reachable via that
   link or a freshly-generated one) and confirm it loads and shows the
   incident. Try "End Lockdown" and confirm the site goes back to
   normal (skip the actual SQL import step unless you have a real
   backup file handy).
7. **Trip Gatekeeper 2 by hand.** Submit the booking form (or use the
   automated script's payload) with `' OR '1'='1` in a text field.
   Should reject immediately and create a `gatekeeper: 2` BreachEvent.
8. **Gatekeeper 3 — new device.** Covered by the "Gatekeeper 3 Live
   Test" browser card (section 0 above) now — no need to do this by
   hand unless you want to double-check the card itself.
9. **Gatekeeper 3 — impossible travel (still manual-only).** This is
   the one thing nothing else covers, since it needs two real,
   differently-geolocated IPs — faking it with reserved test-net IPs
   never works because MaxMind has no coordinates for those ranges.
   Use a VPN set to a different country, sign in as super-admin, then
   switch to a second VPN location far enough away and sign in again
   shortly after — should trigger the impossible-travel check.

---

## Known limitations to keep in mind

- Gatekeeper 3 blocks the IP the same as GK1/GK2 (see Step 1 of
  `services/breachResponse.js`) — accepted trade-off, since GK3 fires
  after a *correct* password and the IP could belong to the real
  super-admin. The vault recovery page and the Unban IP section are
  both reachable via a separate auth chain, never gated by the IP
  block itself, so a real admin blocked here can still get back in
  from another device/network.
- Unbanning an IP (vault's "Unban IP" section) requires two separate
  fresh step-up codes — one to view the blocked list, another to
  actually unban — a deliberate choice to keep unbanning as
  intentional as ending a lockdown, never a casual single-click toggle.
