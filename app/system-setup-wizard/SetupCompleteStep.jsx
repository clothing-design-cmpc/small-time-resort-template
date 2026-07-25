/**
 * FILE: app/system-setup-wizard/SetupCompleteStep.jsx
 * ROLE: Client Component — Step 10 of the setup wizard (final screen)
 *
 * PURPOSE:
 * Renders once VerifyVaultAccessStep's "I've Verified Vault Access"
 * is clicked (Step 9). This is a pure confirmation screen — no server
 * calls, nothing left to do. setup_completed was already logged back
 * in generate-passphrase/route.js's Step 8 request (see that route's
 * SELF-LOCK NOTE for why it fires there and not here); by this point
 * isSetupWizardLocked() has been true for two steps already, so any
 * wizard API route this screen might have called would already 404.
 *
 * From here on, reloading /system-setup-wizard itself returns a plain
 * 404 (app/system-setup-wizard/page.jsx's own check) — this screen is
 * the last thing this route will ever render for this deployment.
 *
 * DATA FLOW: none. Static confirmation + a plain link to
 * /superAdmin/login for whoever is finishing setup to sign in as the
 * owner admin they created back in Step 4.
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
        Before you leave this page: confirm you've saved the vault passphrase (Step 8) and the
        super-admin password (Step 4) somewhere durable. Neither can be recovered from this
        wizard again.
      </p>
      <a href="/superAdmin/login" className="setupWizardButton">
        Go to Super-Admin Login
      </a>
    </div>
  );
}
