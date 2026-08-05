/**
 * FILE: app/system-setup-wizard/SetupCompleteStep.jsx
 * ROLE: Client Component — Step 11 of the setup wizard (final screen)
 *
 * PURPOSE:
 * Renders once PreHandoffTestingStep's checklist is fully checked off
 * (Step 10). The owner admin (Step 3) and vault passphrase (Step 6,
 * scripts/setupVaultPassphrase.js) are both prerequisites checked by
 * arePrerequisitesMet() (services/setupWizardStatus.js) before this
 * screen's "Finished testing" button is allowed to actually lock
 * anything — see that file's header for the DB-row-or-env-fallback
 * logic.
 *
 * THE WIZARD IS STILL OPEN AT THIS POINT (changed):
 * Unlike before, isSetupWizardLocked() (services/setupWizardStatus.js)
 * is NOT true yet just because the owner admin and vault passphrase
 * exist — it now also requires SystemSettings.setupFinalized, set only
 * by the button below. So reaching this screen does NOT 404 the wizard
 * on reload; earlier steps stay fully testable/repeatable until
 * "Finished testing" is clicked.
 *
 * "FINISHED TESTING" BUTTON — THIS IS THE ACTUAL LOCK TRIGGER:
 * Calls /api/system-setup-wizard/finalize-setup, which sets
 * SystemSettings.setupFinalized. The moment that succeeds:
 *   - /system-setup-wizard -> 404 on next load
 *   - every /api/system-setup-wizard/* route -> rejects
 *   - scripts/postinstallSetup.mjs stops reopening the setup guide
 * There is no button to undo this — only clearing the owner admin and
 * vault passphrase from the database reopens the wizard afterward.
 * Don't click it until you're genuinely done testing.
 *
 * OWNER-IP LENIENCY WARNING (added after a real handoff mix-up):
 * The FIRST clean (non-anomalous) super-admin login after finalizing
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
 * DATA FLOW: "Finished testing" button -> POST
 * /api/system-setup-wizard/finalize-setup -> toast success/error ->
 * on success, wizard is locked from that request onward.
 */
"use client";

import { useState } from "react";
import { useToast } from "./shared/useToast";
import ToastStack from "./shared/ToastStack";

export default function SetupCompleteStep() {
  const { toasts, showToast, dismissToast } = useToast();
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isFinalized, setIsFinalized] = useState(false);

  /**
   * handleFinalizeSetup
   * Locks the wizard for good: sets SystemSettings.setupFinalized via
   * the finalize-setup route. Disabled after a successful call so it
   * can't be double-submitted.
   */
  async function handleFinalizeSetup() {
    setIsFinalizing(true);
    try {
      const response = await fetch("/api/system-setup-wizard/finalize-setup", { method: "POST" });
      const result = await response.json();

      if (result.success) {
        showToast("✓ Setup finalized. The wizard is now locked.", "success");
        setIsFinalized(true);
      } else {
        showToast("✕ " + result.message, "error");
      }
    } catch {
      showToast("✕ Network error — please try again.", "error");
    } finally {
      setIsFinalizing(false);
    }
  }

  return (
    <div className="setupWizardCard">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <span className="setupWizardEyebrow">Step 11 of 11</span>
      <h1 className="setupWizardTitle">Setup complete — not yet locked</h1>
      <p className="setupWizardBody">
        Every earlier step still works right now — the owner admin and vault passphrase existing
        is not enough on its own anymore. The wizard only locks (and the setup guide stops
        reopening on <code>npm install</code> / <code>npm run dev</code>) once you click
        "Finished testing" below.
      </p>
      <p className="setupWizardError">
        Before you click that button: confirm you've saved the vault passphrase (Step 7) and the
        super-admin password (Step 3) somewhere durable. Neither can be recovered from this
        wizard again once it locks.
      </p>

      <h2 className="setupWizardTestingGroupTitle">Ready for production?</h2>
      <p className="setupWizardBody">
        Click below only once you've finished testing and confirmed the site is production-ready.
        This permanently locks <code>/system-setup-wizard</code> (plain 404 from then on, even
        with the correct <code>WIZARD_SETUP_KEY</code>) and stops the setup guide from reopening.
        There is no button to undo this — the only way back in afterward is removing the owner
        admin and vault passphrase from the database.
      </p>
      <button
        type="button"
        className="setupWizardButton"
        onClick={handleFinalizeSetup}
        disabled={isFinalizing || isFinalized}
      >
        {isFinalized ? "✓ Setup finalized — wizard locked" : isFinalizing ? "Locking…" : "Finished testing — lock the wizard"}
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
