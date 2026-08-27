# Gatekeeper 3 Pre-Lockdown OTP Challenge

Covers a feature built on top of the existing 3-Gatekeeper breach
response (`services/breachResponse.js` — see `docs/gatekeeper-testing.md`
for that base system). This does **not** replace Gatekeeper 3 — it adds
one step **before** it can fire, only for the case where the password
was correct but the login itself looked anomalous.

## The problem this solves

Before this feature, ANY anomalous-but-correct-password login —
whether it was actually an attacker with a stolen password, or just
the resort owner's family member signing in from their own new phone
or a different city — immediately triggered the full Gatekeeper 3
response: site-wide lockdown, off-cycle backup, vault passphrase
rotation, and (previously) an IP block. A legitimate family member
logging in was treated exactly like a real intrusion, and undoing that
required the developer to manually unlock the site.

## The fix — one OTP step before Gatekeeper 3 fires

```
Correct password entered
        │
        ▼
Anomaly detected? (new device OR impossible travel)
        │
   ┌────┴────┐
   │ NO       │ YES
   ▼          ▼
Login       Generate 6-digit code, hash + store it on a new
completes   LoginAnomalyChallenge row, email the PLAINTEXT code
normally    to VAULT_OWNER_EMAIL. Login stays "pending" — no
(unchanged) session cookie yet. Login page shows a code-entry
            screen with a 3-minute countdown.
                    │
        ┌───────────┼───────────────┐
        │ correct    │ wrong /       │ countdown hits
        │ code       │ max attempts  │ zero, nothing
        │ (≤3 min)   │ exceeded      │ submitted
        ▼            ▼               ▼
   Login          Gatekeeper 3   Gatekeeper 3 fires
   completes,     fires exactly  exactly as before —
   device is      as before      silence is never
   effectively    this feature   treated as approval
   trusted from   existed
   here on
```

**Only the moment Gatekeeper 3 fires changed.** Every eventual failure
path (wrong code, exhausted attempts, or the window expiring) fires
the exact same `triggerGatekeeperBreach({ gatekeeper: 3, ... })` call
that used to run immediately — same site-wide lockdown, same backup,
same vault rotation, same owner-IP `skipIpBlock` leniency. Gatekeeper 1
(brute force) and Gatekeeper 2 (SQL injection) are completely
untouched by this feature.

## Why email OTP, not a live "pick the matching number" approval

An earlier design considered a Google-style real-time approval (the
new device shows a number, an already-logged-in trusted device picks
the matching one from a set of decoys). That was dropped because it
deadlocks the moment nobody else is currently logged in to approve
from — which, for a small owner+family setup, is a very real case.
Email has no such dependency: it always has an address to land in,
whether or not anyone is currently signed in anywhere.

## Why device fingerprint, not IP, decides "same device"

Home/mobile IPs change on their own (ISP rotation, switching cell
towers, moving to a different network) without the device or the
person actually changing. Gating "is this the same device" on IP alone
would mean a legitimate return visit could still trip the OTP
challenge — or worse, under an earlier design that was considered and
rejected, could lock the real owner out entirely if IP were used as a
hard requirement instead of a challenge trigger. The device fingerprint
(`services/deviceFingerprint.js`, already used everywhere else in this
app's anomaly detection) is what actually decides whether the OTP
challenge fires. `SystemSettings.ownerVerifiedIp` still exists and
still does exactly what it did before this feature — Gatekeeper 1
leniency, and (only if the OTP challenge below ultimately fails) skips
the IP-block step of the final Gatekeeper 3 response — but it plays no
part in deciding whether the OTP challenge itself is required.

## Files touched

| File | Role |
|---|---|
| `prisma/schema.prisma` | New `LoginAnomalyChallenge` model — one row per anomalous login attempt |
| `services/loginAnomalyOtp.js` | Create / verify / expire the OTP challenge (scrypt hash, timing-safe compare — same pattern as `services/vaultOtp.js`) |
| `services/loginSession.js` | Extracted session-cookie-building helpers, shared by the normal login route and the OTP-verify route |
| `services/emailAlert.js` | `sendLoginAnomalyOtpEmail()` — sends the code to `VAULT_OWNER_EMAIL` |
| `services/breachResponse.js` | Bugfix: `skipIpBlock` was accepted but never actually read — now honored |
| `app/api/auth/login/route.js` | On an anomalous login, creates the challenge and responds `{ otpRequired: true, challengeId, expiresAt }` instead of firing Gatekeeper 3 directly |
| `app/api/auth/login-otp/verify/route.js` | New — verifies the submitted code, finishes the login or fires Gatekeeper 3 |
| `app/api/auth/login-otp/expire/route.js` | New — called by the login page's own countdown when time runs out unanswered |
| `app/superAdmin/login/page.jsx` / `Login.css` | New OTP entry screen with a live countdown, replacing the normal form while a challenge is pending |

## Testing

1. Trigger an anomaly the same way `docs/gatekeeper-testing.md`'s "GK3
   Live Test" card does (log in once normally, then again simulating a
   new device) — but stop short of expecting an immediate lockdown.
2. Confirm `VAULT_OWNER_EMAIL` receives a 6-digit code within a few
   seconds, and the login page shows the "Confirm Sign-In" screen with
   a counting-down `3:00`.
3. **Correct-code path:** enter the code within 3 minutes → should
   redirect straight to `/superAdmin/dashboard`, and `BreachEvent`
   should show no new row for this attempt.
4. **Wrong-code path:** enter an incorrect code → inline error, form
   stays open (unless that was the 5th wrong attempt, which should
   immediately lock the form and fire Gatekeeper 3 the same as #5 below).
5. **Timeout path:** let the countdown reach `0:00` with nothing
   submitted → form locks itself, and `BreachEvent`/`SystemSettings.breachLockdown`
   should show Gatekeeper 3 fired, same as before this feature existed.
6. Confirm a normal, non-anomalous login (same device, same rough
   location) is completely unaffected — no OTP screen, no email sent.

## Known limitations

- No "resend code" button yet — if the email is lost or delayed, the
  only recovery is letting the 3-minute window expire (which fires
  Gatekeeper 3) and trying the login again from scratch.
- The OTP email currently always goes to `VAULT_OWNER_EMAIL` regardless
  of which admin account attempted the login — by design, since only
  the owner's inbox can confirm whether a family member is signing in,
  but worth knowing if a project ever needs per-admin-account OTP
  recipients instead of one shared owner address.
