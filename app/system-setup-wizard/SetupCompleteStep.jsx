/**
 * FILE: app/system-setup-wizard/SetupCompleteStep.jsx
 * ROLE: Client Component — Step 11 of the setup wizard (final screen)
 *
 * PURPOSE:
 * Renders once PreHandoffTestingStep's checklist is fully checked off
 * (Step 10). setup_completed was already logged back in
 * generate-passphrase/route.js's Step 7 request (see that route's
 * SELF-LOCK NOTE for why it fires there and not here); by this point
 * isSetupWizardLocked() has been true for three steps already, so any
 * wizard API route this screen might have called would already 404 —
 * EXCEPT dismiss-guide below, which specifically requires the lock to
 * already be true (see that route's own comment).
 *
 * From here on, reloading /system-setup-wizard itself returns a plain
 * 404 (app/system-setup-wizard/page.jsx's own check) — this screen is
 * the last thing this route will ever render for this deployment.
 *
 * "FINISHED TESTING" BUTTON:
 * The owner+vault check already stops scripts/postinstallSetup.mjs
 * from reopening the setup guide a few steps before this screen even
 * renders — this button does NOT change wizard access or lock state.
 * It sets a separate, explicit SystemSettings.setupGuideDismissed flag
 * (via /api/system-setup-wizard/dismiss-guide) purely so a developer
 * who wants a deliberate, visible confirmation — rather than relying
 * on the derived state alone — has one. Safe to click more than once;
 * safe to skip entirely.
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
 * DATA FLOW: dismiss-guide button -> POST /api/system-setup-wizard/dismiss-guide
 * -> toast success/error. Everything else on this screen is static.
 */
"use client";

import { useState } from "react";
import { useToast } from "./shared/useToast";
import ToastStack from "./shared/ToastStack";

export default function SetupCompleteStep() {
  const { toasts, showToast, dismissToast } = useToast();
  const [isDismissing, setIsDismissing] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  /**
   * handleDismissGuide
   * Confirms production testing is done and tells the postinstall/predev
   * hook to stop reopening the setup guide. Disabled after a successful
   * call so it can't be double-submitted.
   */
  async function handleDismissGuide() {
    setIsDismissing(true);
    try {
      const response = await fetch("/api/system-setup-wizard/dismiss-guide", { method: "POST" });
      const result = await response.json();

      if (result.success) {
        showToast("✓ Setup guide will no longer open automatically.", "success");
        setIsDismissed(true);
      } else {
        showToast("✕ " + result.message, "error");
      }
    } catch {
      showToast("✕ Network error — please try again.", "error");
    } finally {
      setIsDismissing(false);
    }
  }

  return (
    <div className="setupWizardCard">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <span className="setupWizardEyebrow">Step 11 of 11</span>
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

      <h2 className="setupWizardTestingGroupTitle">Ready for production?</h2>
      <p className="setupWizardBody">
        Once you've finished testing and confirmed the site is production-ready, click below —
        the setup guide (<code>scripts/setup-guide.html</code>) will stop reopening on
        <code> npm install</code> / <code>npm run dev</code>. This is optional: it already stops
        reopening on its own once setup is this far along — this button just makes it explicit.
      </p>
      <button
        type="button"
        className="setupWizardButton"
        onClick={handleDismissGuide}
        disabled={isDismissing || isDismissed}
      >
        {isDismissed ? "✓ Guide dismissed" : isDismissing ? "Saving…" : "Finished testing — stop showing the setup guide"}
      </button>

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
