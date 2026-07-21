# 3-Gatekeeper Breach Response — QA Testing Guide

Covers the feature built in `services/breachResponse.js` and wired into
`app/api/auth/login/route.js`, `app/api/bookings/route.js`, and
`proxy.js`. Two ways to test it: the automated checker script
(fast, repeatable, covers Gatekeepers 1 & 2), and the manual walkthrough
(covers everything, including the recovery page UI and Gatekeeper 3).

**Never run either against production.** Both deliberately trip real
breach detectors — that's the whole point — which means the site
actually locks down while you test it.

---

## 0. Browser-based tester (Gatekeepers 1 & 2, no terminal needed)

Super-admin -> Security -> **Gatekeeper Tester**
(`/superAdmin/gatekeeper-tester`). Same two checks as the CLI script
below, editable test IPs, results shown as a pass/fail checklist right
in the page. Runs against whatever deployment you're logged into —
same production warning applies. See `services/gatekeeperTester.js`
for the exact logic.

## 1. Automated checker (Gatekeepers 1 & 2)

```bash
BASE_URL=http://localhost:3000 npm run check:gatekeepers
```

Test IPs can be overridden if you need to dry-run against a specific
address (defaults to the reserved 203.0.113.x range):

```bash
BASE_URL=http://localhost:3000 TEST_IP_GATEKEEPER_1=203.0.113.55 npm run check:gatekeepers
```

What it does, in order:
1. Sends 6 wrong-password login attempts from a fake test IP
   (`203.0.113.11`, reserved for documentation/testing — RFC 5737) and
   confirms the 6th returns `429`.
2. Confirms a `BlockedIp` row and a `BreachEvent` row (`gatekeeper: 1`)
   were created, and that `SystemSettings.breachLockdown` flipped on.
3. Confirms the same test IP now gets `403` on a completely unrelated
   route (proves the middleware IP check works site-wide, not just on login).
4. Submits a booking with a classic SQL injection payload in
   `guestName` (a free-text field — this project's `sqlInjectionGuard.js`
   scans every string field, but `guestName` doesn't need to pass a
   format check like `guestEmail` does, so it's the reliable field to test through).
5. Confirms the booking is rejected (`400`) and a second `BreachEvent`
   row (`gatekeeper: 2`) was created.
6. **Always** cleans up afterward (even if a check fails) — deletes the
   test `BlockedIp`/`BreachEvent` rows and resets `breachLockdown` back
   to `false`, so the real site is never left down because of a test run.

Exit code is `0` if every check passed, `1` otherwise — safe to wire
into a CI step later if this project ever adds one.

**What this script does NOT cover** — test these by hand instead:
- Gatekeeper 3 (anomalous admin login) — needs a real prior login
  history and a genuinely different geolocation/device to trigger
  honestly; faking it in a script would give false confidence.
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
   wrong password 6 times. The 6th should return 429. Check
   `blocked_ips` and `breach_events` via `npx prisma studio`, and
   confirm the visitor homepage now shows the full lockdown screen
   (`components/shared/BreachLockdownScreen.jsx`), not just a banner.
4. **Confirm you're actually blocked.** Try loading any page — even the
   homepage — from the same browser. Expect a plain "Access denied" 403.
5. **Unblock yourself.** No admin UI for this yet (deliberately — see
   Rule 40.6-style reasoning in `overviewProject.txt`). Delete your own
   row from `blocked_ips` directly via `npx prisma studio` or the
   Supabase dashboard.
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
8. **Gatekeeper 3 — intentionally hard to test.** It needs genuine
   impossible-travel or new-device detection to avoid false positives.
   Use a VPN set to a different country plus a device/browser you
   haven't logged in from before, then sign in as super-admin.

---

## Known limitations to keep in mind

- Gatekeeper 3 deliberately does **not** auto-block the IP (see the
  comment in `services/breachResponse.js`) — it fires after a *correct*
  password, so blocking that session's IP risked locking the real
  super-admin out of their own recovery page. Everything else in the
  response (lockdown, backup, alert) still fires.
- There is no "unblock IP" button anywhere in the admin panel yet —
  unblocking requires direct database access. This was a deliberate
  choice to keep unblocking as deliberate as ending a lockdown, not a
  casual toggle — flag it if you'd rather have a UI for this.
