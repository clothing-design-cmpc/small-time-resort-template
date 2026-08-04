/**
 * FILE: app/api/superAdmin/settings/booking-rules/run-expiry-sweep/route.js
 * ROLE: Super-admin only — protected by requireSuperAdmin()
 *
 * PURPOSE:
 * Manual trigger for the exact same sweep app/api/cron/booking-expiry
 * runs on Vercel's 15-minute schedule (see services/bookingExpirySweep.js).
 * Exists because Vercel Cron never fires against `next dev` / localhost —
 * without this, a developer testing the DP Countdown / auto-cancellation
 * flow locally has no way to actually see it happen short of deploying.
 *
 * Read/write on the resort's OWN booking data only (never an external
 * trigger, never a backup — Rule 40.6's "never trigger from the app"
 * restriction is about offsite backups, not this).
 *
 * DATA FLOW:
 * 1. PendingHoldSection.jsx's "Run Expiry Sweep Now" button -> POST here
 * 2. runBookingExpirySweep() does the real work (shared with the cron route)
 * 3. Result is also written to Security Logs (Rule 38) so it's visible
 *    there too, same as the cron's own automatic runs — but tagged with
 *    the admin's own uid instead of "system:booking-expiry-cron", so the
 *    audit trail is honest about this having been a manual trigger.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/services/adminSession";
import { logSecurityEvent } from "@/services/securityLog";
import { runBookingExpirySweep } from "@/services/bookingExpirySweep";

export async function POST(request) {
  const session = requireSuperAdmin(request);
  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "You don't have permission to do this." },
      { status: 401 }
    );
  }

  try {
    const { expiredCount, breachedCount, expiredReferenceCodes, breachedReferenceCodes } =
      await runBookingExpirySweep();

    if (expiredCount > 0) {
      await logSecurityEvent({
        eventType: "admin_action",
        actor: session.uid,
        request,
        details: `Manually ran the expiry sweep — auto-expired ${expiredCount} pending booking(s): ${expiredReferenceCodes.join(", ")}.`,
      });
    }

    if (breachedCount > 0) {
      await logSecurityEvent({
        eventType: "admin_action",
        actor: session.uid,
        request,
        details: `Manually ran the expiry sweep — ${breachedCount} short-window booking(s) flagged for review: ${breachedReferenceCodes.join(", ")}.`,
      });
    }

    return NextResponse.json({
      success: true,
      data: { expiredCount, breachedCount },
      message:
        expiredCount === 0 && breachedCount === 0
          ? "Nothing to expire right now — no pending booking has passed its DP Countdown yet."
          : `Expired ${expiredCount} pending booking(s); flagged ${breachedCount} for review.`,
    });
  } catch (error) {
    console.error("[api/superAdmin/settings/booking-rules/run-expiry-sweep] Failed:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "Failed to run the expiry sweep. Please try again." },
      { status: 500 }
    );
  }
}
