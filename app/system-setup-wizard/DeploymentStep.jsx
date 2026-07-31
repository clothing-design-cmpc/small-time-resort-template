/**
 * FILE: app/system-setup-wizard/DeploymentStep.jsx
 * ROLE: Client Component — Step 9 of the setup wizard
 *
 * PURPOSE:
 * Renders once VerifyVaultAccessStep's "I've Verified Vault Access" is
 * clicked (Step 8). Everything before this step ran against
 * localhost — this step exists so the project actually goes live
 * before <PreHandoffTestingStep /> (Step 10) runs its "test the real,
 * deployed site (not just localhost)" checklist. Without this step,
 * Step 10 would have no live URL to test against.
 *
 * Like ExternalSetupStep.jsx (Step 6), this is pure reference
 * instructions — no server calls, nothing this page can verify for
 * you, since deploying and pointing DNS both happen outside this app
 * entirely (Vercel's dashboard/CLI, Hostinger's hPanel). "Continue"
 * is a plain client-side acknowledgment, same pattern Step 6 uses.
 *
 * THREE PARTS COVERED:
 *   1. Push to GitHub + import the project into Vercel, with every
 *      .env.local key copied into Vercel's Environment Variables.
 *   2. Buy/point a domain on Hostinger, then add it in Vercel and
 *      create the DNS records Hostinger's DNS Zone Editor needs
 *      (apex A record -> 76.76.21.21, www CNAME -> cname.vercel-dns.com
 *      — Vercel's own domain card shows the exact values for this
 *      project, since they can differ per-project; these are the
 *      general-purpose defaults).
 *   3. Post-deploy updates that are easy to forget: NEXT_PUBLIC_SITE_URL
 *      (siteConfig group, Step 4) must point at the final domain, not
 *      the Vercel-assigned *.vercel.app one, and CRON_SECRET plus
 *      every other .env.local secret must be re-entered in Vercel's
 *      Environment Variables — .env.local never leaves the local
 *      machine, so Vercel starts with none of them set.
 *
 * DATA FLOW: none. Pure client-side reference step -> hands off to
 * <PreHandoffTestingStep /> (Step 10) once "Continue" is clicked.
 */
"use client";

import { useState } from "react";
import { useToast } from "./shared/useToast";
import ToastStack from "./shared/ToastStack";
import PreHandoffTestingStep from "./PreHandoffTestingStep";

// Deploy commands a person can also run from the Vercel CLI instead of
// the dashboard import flow — optional, dashboard works fine on its own.
const DEPLOY_COMMANDS = [
  {
    title: "1. Install the Vercel CLI (optional — dashboard import works too)",
    command: "npm install -g vercel",
    description: "Only needed if you'd rather deploy from the terminal than vercel.com's dashboard import.",
  },
  {
    title: "2. Deploy from the project root",
    command: "vercel --prod",
    description:
      "Links this folder to a Vercel project on first run (prompts for scope + project name), then deploys straight to production. Re-running this later ships a new deploy without going through GitHub at all.",
  },
];

// The exact DNS records Hostinger's DNS Zone Editor needs. Vercel's own
// domain card (Project -> Settings -> Domains -> your domain) shows the
// authoritative value for this specific project — use that if it ever
// differs from the general-purpose value below.
const DNS_RECORDS = [
  { type: "A", host: "@", value: "76.76.21.21", note: "Apex/root domain (e.g. yourresort.com)" },
  { type: "CNAME", host: "www", value: "cname.vercel-dns.com", note: "www subdomain (e.g. www.yourresort.com)" },
];

export default function DeploymentStep() {
  const { toasts, showToast, dismissToast } = useToast();
  const [continued, setContinued] = useState(false);

  async function handleCopy(value) {
    try {
      await navigator.clipboard.writeText(value);
      showToast("✓ Copied.", "success");
    } catch {
      showToast("✕ Couldn't copy automatically — please copy it manually.", "error");
    }
  }

  if (continued) {
    return <PreHandoffTestingStep />;
  }

  return (
    <div className="setupWizardStepGroup">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <div className="setupWizardCard">
        <span className="setupWizardEyebrow">Step 9 of 11</span>
        <h1 className="setupWizardTitle">Deploy to Vercel &amp; connect your domain</h1>
        <p className="setupWizardBody">
          Everything so far has run on localhost. This step puts the site on a real URL —
          required before the next step&apos;s live-site checklist means anything.
        </p>
      </div>

      <div className="setupWizardCard">
        <h2 className="setupWizardSubStepTitle">1. Push the repo to GitHub</h2>
        <p className="setupWizardBody">
          If this project isn&apos;t already on GitHub, create a repo and push the{" "}
          <code>static</code> branch there first — Vercel&apos;s dashboard import needs a Git
          repo to connect to (the CLI option below doesn&apos;t).
        </p>
      </div>

      <div className="setupWizardCard">
        <h2 className="setupWizardSubStepTitle">2. Import the project into Vercel</h2>
        <p className="setupWizardBody">
          Go to <code>vercel.com</code>, sign in with GitHub, click &quot;Add New&quot; →
          &quot;Project&quot;, and select this repo. Before the first deploy, open the
          &quot;Environment Variables&quot; section and paste in every key from{" "}
          <code>.env.local</code> — Vercel starts with none of them set, since{" "}
          <code>.env.local</code> is git-ignored and never leaves your machine (Rule 18.5).
          Missing keys here is the single most common reason a deploy builds fine but the
          live site 500s on its first real request.
        </p>
        <p className="setupWizardBody">
          Alternatively, deploy from the CLI instead of the dashboard import:
        </p>
        {DEPLOY_COMMANDS.map((item) => (
          <div key={item.command} className="setupWizardCommandRow">
            <code className="setupWizardCodeBlock">{item.command}</code>
            <button type="button" className="setupWizardCopyButton" onClick={() => handleCopy(item.command)}>
              Copy
            </button>
          </div>
        ))}
        <p className="setupWizardBody">
          The CLI still needs every <code>.env.local</code> key added separately under Project
          Settings → Environment Variables in the dashboard — <code>vercel --prod</code> does
          not read <code>.env.local</code> for you.
        </p>
      </div>

      <div className="setupWizardCard">
        <h2 className="setupWizardSubStepTitle">3. Buy/point your domain on Hostinger</h2>
        <p className="setupWizardBody">
          If you don&apos;t already own the domain, buy it through Hostinger&apos;s hPanel →
          Domains. If you already own it elsewhere, this step assumes Hostinger is managing
          its DNS (hPanel → Domains → your domain → DNS / Nameservers).
        </p>
      </div>

      <div className="setupWizardCard">
        <h2 className="setupWizardSubStepTitle">4. Add the domain in Vercel</h2>
        <p className="setupWizardBody">
          In the Vercel project → Settings → Domains, type in your domain and click Add.
          Vercel shows the exact DNS records it needs — they usually match the table below,
          but always use the value shown on your own project&apos;s domain card if it differs.
        </p>
      </div>

      <div className="setupWizardCard">
        <h2 className="setupWizardSubStepTitle">5. Create the DNS records in Hostinger</h2>
        <p className="setupWizardBody">
          hPanel → Domains → your domain → DNS / Nameservers → DNS Zone Editor. Add both
          records below. If Hostinger auto-created a conflicting record on the same host
          (e.g. a default A record for <code>www</code>), delete it first — two competing
          records on the same host causes intermittent SSL/verification failures.
        </p>
        {DNS_RECORDS.map((record) => (
          <div key={record.host} className="setupWizardCommandRow">
            <code className="setupWizardCodeBlock">
              {record.type}  {record.host}  →  {record.value}
            </code>
            <button
              type="button"
              className="setupWizardCopyButton"
              onClick={() => handleCopy(record.value)}
            >
              Copy
            </button>
          </div>
        ))}
        <p className="setupWizardBody">
          {DNS_RECORDS.map((r) => r.note).join(" • ")}. DNS propagation is usually minutes but
          can take up to 24–48 hours — Vercel provisions an SSL certificate automatically once
          it verifies, no action needed on your end for that part.
        </p>
      </div>

      <div className="setupWizardCard">
        <h2 className="setupWizardSubStepTitle">6. Post-deploy env var updates</h2>
        <p className="setupWizardBody">
          Two things are easy to forget once the domain is live:
        </p>
        <p className="setupWizardBody">
          • Update <code>NEXT_PUBLIC_SITE_URL</code> in Vercel&apos;s Environment Variables to
          your final domain (e.g. <code>https://yourresort.com</code>), not the temporary{" "}
          <code>*.vercel.app</code> one Vercel assigns by default — this is the same key
          documented back in Step 4&apos;s siteConfig group, now pointed at the real address.
        </p>
        <p className="setupWizardBody">
          • Confirm <code>CRON_SECRET</code> in Vercel matches <code>.env.local</code> exactly
          — a mismatch fails the nightly vault auto-rotate and AI insight cron jobs silently
          with a 401, and won&apos;t surface until someone checks the Vercel cron logs.
        </p>
        <p className="setupWizardBody">
          After changing any environment variable in Vercel, redeploy (Vercel → Deployments →
          &quot;⋯&quot; on the latest deploy → Redeploy) — env var changes don&apos;t apply to
          an already-built deployment.
        </p>
      </div>

      <div className="setupWizardCard">
        <p className="setupWizardBody">
          Once the domain resolves and loads the live site, continue to the pre-handoff
          testing checklist — that step assumes a real, deployed URL, not localhost.
        </p>
        <button type="button" className="setupWizardButton" onClick={() => setContinued(true)}>
          Continue
        </button>
      </div>
    </div>
  );
}
