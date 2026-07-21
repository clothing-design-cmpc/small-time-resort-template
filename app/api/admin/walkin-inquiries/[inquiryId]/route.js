/**
 * FILE: app/api/admin/walkin-inquiries/[inquiryId]/route.js
 * ROLE: Super-admin only — verified via requireSuperAdmin(), not middleware.js
 *
 * PURPOSE:
 * Updates a single WalkInInquiry's status as staff work the lead:
 * "new" -> "contacted" (called them) -> "converted" (booking was
 * created for them). Purely a tracking flag — creating the actual
 * Booking still happens on the Bookings page, this just marks the
 * lead as handled so it stops looking urgent in the list.
 *
 * DATA FLOW:
 * 1. WalkInInquiriesClient.jsx PATCHes { status } when staff changes
 *    the dropdown/button for a row
 * 2. requireSuperAdmin() decodes the session cookie
 * 3. Logs an admin_action security event, since this is a staff-driven
 *    write on guest contact data
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireSuperAdmin } from "@/services/adminSession";
import { logSecurityEvent } from "@/services/securityLog";

const ALLOWED_STATUSES = ["new", "contacted", "converted"];

export async function PATCH(request, { params }) {
  const session = requireSuperAdmin(request);
  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "You don't have permission to do this." },
      { status: 401 }
    );
  }

  const { inquiryId } = await params;

  let body;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const status = ALLOWED_STATUSES.includes(body.status) ? body.status : null;
  if (!status) {
    return NextResponse.json(
      { success: false, data: null, message: "Invalid status value." },
      { status: 400 }
    );
  }

  try {
    const inquiry = await prisma.walkInInquiry.update({
      where: { id: inquiryId },
      data: { status },
    });

    await logSecurityEvent({
      eventType: "admin_action",
      actor: session.uid,
      request,
      details: `Marked walk-in inquiry from ${inquiry.guestName} as "${status}".`,
    });

    return NextResponse.json({
      success: true,
      data: { inquiry },
      message: "Inquiry status updated.",
    });
  } catch (error) {
    console.error("[api/admin/walkin-inquiries/id] Failed to update:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't update this inquiry. Please try again." },
      { status: 500 }
    );
  }
}
