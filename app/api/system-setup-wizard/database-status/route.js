/**
 * FILE: app/api/system-setup-wizard/database-status/route.js
 * ROLE: Wizard-session only (Step 2/3 of app/system-setup-wizard) — no
 *       account, no role. Gated by isSetupWizardLocked() AND
 *       hasWizardSession(), same double-gate pattern as verify-key.
 *
 * PURPOSE:
 * Reports real, DB-derived completion status for each sequential
 * sub-step of the wizard's Database Setup screen, instead of trusting
 * a manual checkbox for anything that CAN be verified directly:
 *   - envReady            : DATABASE_URL + DIRECT_URL both present
 *   - dbPushDone          : does the admin_profiles table exist yet?
 *                           (proves `npx prisma db push` ran)
 *   - rlsEnabled          : do all 5 resort tables have RLS turned on?
 *                           (proves `node prisma/enableRls.js` ran)
 *   - exclusionConstraint : does the no_overlapping_bookings exclusion
 *                           constraint exist on bookings? (proves
 *                           `node prisma/addBookingExclusionConstraint.js` ran)
 * `npx prisma generate` (sub-step 3b) has no DB-visible effect — it
 * only rebuilds the local Prisma Client — so that one sub-step stays a
 * manual "I ran this" confirmation on the client, not reported here.
 *
 * Every query is wrapped so a missing table/connection never throws
 * past this route — at Step 3a, before `db push` has run, the DB may
 * not even be reachable yet, and that itself is a valid, expected
 * "not done" state, not an error.
 *
 * DATA FLOW:
 * 1. isSetupWizardLocked() -> setup already done -> reject
 * 2. hasWizardSession() -> Step 1 not passed this session -> reject
 * 3. checkEnvGroupsPresence(["database"]) -> presence-only, no live check
 * 4. Best-effort raw queries against Postgres system catalogs for the
 *    three DB-verifiable sub-steps
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { isSetupWizardLocked } from "@/services/setupWizardStatus";
import { hasWizardSession } from "@/services/wizardSession";
import { checkEnvGroupsPresence } from "@/services/envCheck";
import { prisma } from "@/services/prisma";

const RLS_TABLES = ["rooms", "amenities", "store_products", "admin_profiles", "bookings"];

/**
 * checkDbPushDone
 * A table only exists once `prisma db push` has synced schema.prisma
 * to the database — admin_profiles is used as the canary since every
 * other sub-step depends on it existing anyway.
 */
async function checkDbPushDone() {
  try {
    const rows = await prisma.$queryRaw`
      select to_regclass('public.admin_profiles') is not null as exists;
    `;
    return Boolean(rows?.[0]?.exists);
  } catch {
    // Database unreachable or not yet provisioned — not done, not an error.
    return false;
  }
}

/**
 * checkRlsEnabled
 * True only when every one of the 5 resort tables has row-level
 * security turned on (pg_class.relrowsecurity) — matches exactly what
 * prisma/enableRls.js's ALTER TABLE ... ENABLE ROW LEVEL SECURITY
 * statements set.
 */
async function checkRlsEnabled() {
  try {
    const rows = await prisma.$queryRaw`
      select relname, relrowsecurity
      from pg_class
      where relname = any(${RLS_TABLES}) and relkind = 'r';
    `;
    if (rows.length !== RLS_TABLES.length) return false;
    return rows.every((row) => row.relrowsecurity === true);
  } catch {
    return false;
  }
}

/**
 * checkExclusionConstraint
 * True once the no_overlapping_bookings EXCLUDE constraint exists on
 * bookings — matches the exact constraint name from
 * prisma/addBookingExclusionConstraint.js.
 */
async function checkExclusionConstraint() {
  try {
    const rows = await prisma.$queryRaw`
      select 1
      from pg_constraint
      where conname = 'no_overlapping_bookings';
    `;
    return rows.length > 0;
  } catch {
    return false;
  }
}

export async function GET(request) {
  if (await isSetupWizardLocked()) {
    return NextResponse.json(
      { success: false, data: null, message: "Setup has already been completed." },
      { status: 404 }
    );
  }

  if (!hasWizardSession(request)) {
    return NextResponse.json(
      { success: false, data: null, message: "Setup key required." },
      { status: 401 }
    );
  }

  try {
    const envStatus = checkEnvGroupsPresence(["database"]);
    const envReady = envStatus.overallStatus === "ok";

    // Only attempt the DB-derived checks once the connection env vars
    // are actually present — otherwise the driver adapter has nothing
    // to connect to and every query below would just fail identically.
    const [dbPushDone, rlsEnabled, exclusionConstraint] = envReady
      ? await Promise.all([checkDbPushDone(), checkRlsEnabled(), checkExclusionConstraint()])
      : [false, false, false];

    return NextResponse.json({
      success: true,
      data: {
        envStatus,
        envReady,
        dbPushDone,
        rlsEnabled,
        exclusionConstraint,
      },
      message: "Database status checked.",
    });
  } catch (error) {
    console.error("[api/system-setup-wizard/database-status] Failed:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't check the database status. Please try again." },
      { status: 500 }
    );
  }
}
