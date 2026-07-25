/**
 * FILE: app/system-vault/[vaultSlug]/ScriptsReferenceSection.jsx
 * ROLE: Rendered inside RecoveryClient.jsx only
 *
 * PURPOSE:
 * Answers "which script do I run, and why?" — a developer juggling
 * this project alongside other work will not remember every script in
 * /scripts by name. This card lists every one of them: the exact
 * terminal command, what it actually does, and when to reach for it.
 * Deliberately static (no API call, no DB read) so it works even in
 * the worst-case scenario this card exists for in the first place: a
 * developer with a fresh clone of the repo, a filled-in .env.local,
 * and zero working access to anything else — they can still open this
 * page, read what each script does, and run it from the terminal.
 *
 * DATA FLOW:
 * None — this is a static reference list. Nothing here reads from or
 * writes to the database.
 */
"use client";

import "./ScriptsReferenceSection.css";

/*
 * SCRIPT_GROUPS
 * One entry per script currently in /scripts. `command` is copied
 * verbatim from package.json's "scripts" block where an npm alias
 * exists; scripts with no alias are run directly with `node`.
 * Keep this in sync whenever a script is added, renamed, or retired —
 * see Rule 16 (overviewProject.txt) for the same "update when it
 * changes the developer's mental model" standard.
 */
const SCRIPT_GROUPS = [
  {
    id: "diagnostics",
    label: "Diagnostics — safe to run anytime, changes nothing",
    scripts: [
      {
        command: "npm run check:health",
        purpose: "Checks database connectivity, confirms the core tables (Bookings, Rooms, System Settings) are reachable, and scans for double-booking conflicts.",
        whenToRun: "Anytime something looks off — a booking page not loading, a suspicious calendar gap, or just a routine check. Also runnable from this dashboard's System Health Check card above.",
      },
      {
        command: "npm run envcheck",
        purpose: "Walks every required .env key for presence, then pings the database and GeoIP file to confirm they actually work.",
        whenToRun: "Right after setting up .env.local on a new machine, or when something is failing and you suspect a missing/misconfigured key. Also runs nightly and emails the owner if anything's broken.",
      },
      {
        command: "node scripts/checkVaultSlug.mjs",
        purpose: "Prints the vault recovery URL your server currently computes from the stored passphrase hash.",
        whenToRun: "You have a bookmarked vault link that 404s. The slug rotates on every passphrase change — this tells you the current one.",
      },
      {
        command: "npm run check:gatekeepers",
        purpose: "Automated smoke test for the 3-Gatekeeper breach response system (login brute force, SQL injection, anomalous admin login).",
        whenToRun: "After deploying a change that touches auth, rate limiting, or the breach-response services — confirms the gatekeepers still trip correctly.",
      },
    ],
  },
  {
    id: "recovery",
    label: "Recovery — use when dashboard access is limited or unavailable",
    scripts: [
      {
        command: "node scripts/hashVaultPassphrase.js \"your-passphrase\"",
        purpose: "Turns a plaintext passphrase into the salt:hash string stored in VAULT_PASSPHRASE_HASH.",
        whenToRun: "You're locked out of the vault entirely and need to set (or reset) VAULT_PASSPHRASE_HASH directly in your hosting provider's environment variables, with no dashboard access required.",
      },
      {
        command: "npm run rotate-vault-passphrase",
        purpose: "Forces an immediate vault passphrase rotation from the terminal — same effect as the dashboard's \"Generate New Passphrase\" button.",
        whenToRun: "You suspect the current vault passphrase has leaked and need to rotate it without logging into anything.",
      },
      {
        command: "npm run generate-recovery-card",
        purpose: "Generates a small printable HTML \"recovery card\" — a physical fallback for when both the vault owner's email and R2 are unreachable.",
        whenToRun: "Once, right after initial setup — print it and store it somewhere safe (a physical safe, not a cloud drive).",
      },
      {
        command: "node scripts/setupVault.js \"your-passphrase\"",
        purpose: "One-time local setup for the owner vault — generates the TOTP secret in plaintext (only place this ever happens).",
        whenToRun: "Once, during initial project setup. Never run this again afterward, and never deploy it as an API route.",
      },
    ],
  },
  {
    id: "database",
    label: "Database — inspect, back up, or restore",
    scripts: [
      {
        command: "npm run backup",
        purpose: "Dumps the entire Postgres database with pg_dump, uploads the compressed archive to Cloudflare R2, and records the result.",
        whenToRun: "Runs automatically every night. Run manually before any risky change (schema migration, bulk edit, wipe) as an extra safety net.",
      },
      {
        command: "node scripts/runRestore.js",
        purpose: "Downloads a super-admin-uploaded .sql/.sql.gz backup file and restores it against the live database.",
        whenToRun: "Triggered automatically by the SQL Import feature (super-admin Backups page or this vault's own recovery upload) — not normally run by hand.",
      },
      {
        command: "npm run wipe-database",
        purpose: "Executes a scheduled full database wipe (TRUNCATE), with an optional pre-wipe backup.",
        whenToRun: "Only as the final step of a deliberate, already-scheduled wipe from the Danger Zone below. Irreversible — never run casually.",
      },
      {
        command: "npm run purge-security-logs",
        purpose: "Permanently deletes SecurityLog rows older than SECURITY_LOG_RETENTION_DAYS (data-retention compliance).",
        whenToRun: "Runs automatically on schedule. Manual run only needed if you've changed the retention window and want it applied immediately.",
      },
    ],
  },
  {
    id: "setup",
    label: "One-time setup — run once per environment, not routine",
    scripts: [
      {
        command: "node scripts/generateEnvSecret.mjs",
        purpose: "Prints a fresh random secret for VAULT_SETUP_KEY or CRON_SECRET.",
        whenToRun: "Setting up a new environment (local, staging, or production) for the first time.",
      },
    ],
  },
];

export default function ScriptsReferenceSection() {
  return (
    <div className="recoveryStepCard">
      <h2>Scripts Reference</h2>
      <p>
        Every script in <span className="adminMono">/scripts</span>, what it does, and when to reach
        for it — so you never have to open each file just to remember. If you have zero dashboard
        access but still have the repo, editing <span className="adminMono">.env</span> and running
        the right script from this list is enough to recover most situations.
      </p>

      <div className="scriptsReferenceGroups">
        {SCRIPT_GROUPS.map((group) => (
          <div key={group.id} className="scriptsReferenceGroup">
            <span className="scriptsReferenceGroupLabel">{group.label}</span>
            <ul className="scriptsReferenceList">
              {group.scripts.map((script) => (
                <li key={script.command} className="scriptsReferenceItem">
                  <code className="scriptsReferenceCommand">{script.command}</code>
                  <p className="scriptsReferencePurpose">{script.purpose}</p>
                  <p className="scriptsReferenceWhen">
                    <span className="scriptsReferenceWhenLabel">When to run:</span> {script.whenToRun}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
