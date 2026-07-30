/**
 * FILE: app/system-setup-wizard/SetupCompleteStep.jsx
 * ROLE: Client Component — Step 10 of the setup wizard (final screen)
 *
 * PURPOSE:
 * Renders once PreHandoffTestingStep's checklist is fully checked off
 * (Step 9). This is a pure confirmation screen — no server calls,
 * nothing left to do. setup_completed was already logged back in
 * generate-passphrase/route.js's Step 7 request (see that route's
 * SELF-LOCK NOTE for why it fires there and not here); by this point
 * isSetupWizardLocked() has been true for three steps already, so any
 * wizard API route this screen might have called would already 404.
 *
 * From here on, reloading /system-setup-wizard itself returns a plain
 * 404 (app/system-setup-wizard/page.jsx's own check) — this screen is
 * the last thing this route will ever render for this deployment.
 *
 * OWNER-IP LENIENCY WARNING (added after a real handoff mix-up):
 * The FIRST clean (non-anomalous) super-admin login after this screen
 * auto-registers as SystemSettings.ownerVerifiedIp — see
 * app/api/auth/login/route.js's "AUTO-UPDATE the trusted owner IP"
 * block. Whoever clicks "Go to Super-Admin Login" below and signs in
 * first becomes the IP the Gatekeeper leniency rules trust going
 * forward (5 login attempts instead of 3, and GK3 new-device
 * exemption) — not necessarily the actual resort owner. If the
 * developer logs in here just to double-check everything works, the
 * developer's IP claims that leniency instead of the owner's. This is
 * why the warning below exists and why finalize-handoff (also on this
 * screen) resets it — running that script wipes SystemSettings back
 * to blank, so whoever logs in AFTER finalize-handoff is the one who
 * actually gets registered as the trusted owner IP.
 *
 * DATA FLOW: none. Static confirmation + finalize-handoff instructions
 * + a plain link to /superAdmin/login.
 */
"use client";

export default function SetupCompleteStep() {
  return (
    <div className="setupWizardCard">
      <span className="setupWizardEyebrow">Step 10 of 10</span>
      <h1 className="setupWizardTitle">Setup complete</h1>
      <p className="setupWizardBody">
        First-run setup is finished. This page — and every route under it — will now return a
        plain 404 on every future visit, even with the correct{" "}
        <code>WIZARD_SETUP_KEY</code>. There is no way to reopen it from here; it stays this
        way unless the owner admin and vault passphrase are both removed from the database.
      </p>
      <p className="setupWizardError">
        Before you leave this page: confirm you've saved the vault passphrase (Step 7) and the
        super-admin password (Step 3) somewhere durable. Neither can be recovered from this
        wizard again.
      </p>

      <h2 className="setupWizardTestingGroupTitle">Before you hand this off to the owner</h2>
      <p className="setupWizardBody">
        Run <code>node scripts/runFinalizeHandoff.js</code> (or{" "}
        <code>npm run finalize-handoff</code>) from your own terminal once you're truly done
        testing. It keeps the super-admin account and vault exactly as they are, and truncates
        everything else — rooms, bookings, test logs, content — so the owner's first login sees
        a genuinely blank, production-ready site instead of your test data. It takes a fresh R2
        backup first by default, and asks you to type a confirmation phrase before touching
        anything — there is no button for this anywhere in the app on purpose; it only ever runs
        when you deliberately run it yourself.
      </p>
      <p className="setupWizardError">
        Do NOT click "Go to Super-Admin Login" below just to test it, then hand the device to
        the owner. The very first clean login after this screen automatically becomes the
        trusted "owner IP" for the Gatekeeper leniency rules — if that's you instead of the
        owner, the owner's own future logins get the stricter, non-leniency treatment. Run
        finalize-handoff first (it resets this), then let the owner do the actual first login
        themselves, ideally from their own device.
      </p>

      <a href="/superAdmin/login" className="setupWizardButton">
        Go to Super-Admin Login
      </a>
    </div>
  );
}
