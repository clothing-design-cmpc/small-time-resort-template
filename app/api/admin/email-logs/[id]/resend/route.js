/**
 * FILE: app/api/admin/email-logs/[id]/resend/route.js
 * ROLE: Super-admin only — verified via requireSuperAdmin(), not middleware.js
 *
 * PURPOSE:
 * Powers the "Resend" action on the Email Logs page. Reads the
 * targeted EmailLog row's stored payload (Task 1's "information
 * autofilled"), layers any admin-edited fields from the request body
 * on top, and calls services/emailLogs.js's resendEmailLog() — which
 * re-sends through the exact same services/emailjs.js code path as
 * the original attempt, producing a brand-new EmailLog row rather
 * than mutating the old one.
 *
 * DATA FLOW:
 * 1. Admin expands a row on the Email Logs page (autofilled form,
 *    fields taken straight from that row's payload) and clicks Resend
 * 2. EmailLogsClient POSTs any edited fields as the request body
 * 3. This route calls resendEmailLog(id, overrides)
 * 4. Logs a security event so a manual resend shows up in the audit
 *    trail (who resent it, when, to which log row)
 * 5. Returns the outcome; the client re-fetches the current page so
 *    the new attempt row appears immediately
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/services/adminSession";
import { resendEmailLog } from "@/services/emailLogs";
import { logSecurityEvent } from "@/services/securityLog";

export async function POST(request, { params }) {
  const session = requireSuperAdmin(request);
  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "You don't have permission to do this." },
      { status: 401 }
    );
  }

  const { id } = await params;

  // Body is optional — resending with no edits at all just replays the
  // original payload exactly as stored.
  let overrides = {};
  try {
    const rawBody = await request.text();
    overrides = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return NextResponse.json(
      { success: false, data: null, message: "Invalid request — couldn't read the edited fields." },
      { status: 400 }
    );
  }

  try {
    const result = await resendEmailLog(id, overrides);

    await logSecurityEvent({
      eventType: "admin_action",
      actor: session.uid,
      request,
      details: `Resent email log ${id}${result.success ? "" : " (resend also failed)"}.`,
    });

    return NextResponse.json({
      success: result.success,
      data: null,
      message: result.message,
    });
  } catch (error) {
    console.error("[api/admin/email-logs/resend] Failed:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't resend this email. Please try again." },
      { status: 500 }
    );
  }
}
