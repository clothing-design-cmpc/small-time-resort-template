/**
 * FILE: app/system-setup-wizard/page.jsx
 * ROLE: Public — but only until first-run setup completes (AUTO-LOCK)
 *
 * PURPOSE:
 * Entry point for the first-run setup wizard: a guided flow for
 * bootstrapping a freshly cloned deployment (env vars, database,
 * super-admin account, vault). This page renders ONLY Step 1 (the
 * WIZARD_SETUP_KEY gate) — later steps are added as their own routes
 * as the wizard is built out incrementally.
 *
 * AUTO-LOCK (see services/setupWizardStatus.js):
 * Before rendering anything, this Server Component checks whether
 * setup is already complete (an isOwner AdminProfile AND a set
 * VaultPassphrase both exist). If so, calls notFound() — the page
 * behaves as if it never existed. This check runs on EVERY request,
 * not once at build time, so the page locks itself the moment setup
 * finishes without needing a redeploy. Every API route under
 * app/api/system-setup-wizard/ performs this same check independently
 * — the page alone is not the enforcement boundary.
 *
 * DATA FLOW:
 * 1. isSetupWizardLocked() — DB read, decides 404 vs render
 * 2. If not locked, render <SetupKeyForm /> (Client Component),
 *    which POSTs to /api/system-setup-wizard/verify-key
 */
import { notFound } from "next/navigation";
import { isSetupWizardLocked } from "@/services/setupWizardStatus";
import SetupKeyForm from "./SetupKeyForm";
import "./SetupWizard.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "First-Run Setup",
  robots: { index: false, follow: false },
};

export default async function SetupWizardPage() {
  // Enforcement point — a locked wizard renders nothing past this line.
  if (await isSetupWizardLocked()) {
    notFound();
  }

  return (
    <section className="setupWizardSection">
      <div className="setupWizardWrapper">
        <SetupKeyForm />
      </div>
    </section>
  );
}
