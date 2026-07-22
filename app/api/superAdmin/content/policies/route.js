/**
 * FILE: app/api/superAdmin/content/policies/route.js
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * GET -> returns the policy + contact-info subset of the singleton
 *        SystemSettings row, creating it with schema defaults on
 *        first request if it doesn't exist yet (get-or-create — same
 *        pattern as BookingRules).
 * PUT -> updates that subset (blueprint Page 8: House Rules,
 *        Cancellation Policy, Terms & Conditions, Privacy Policy,
 *        About Page, Contact Information). Never touches the
 *        homepage/SEO fields that also live on this row — those are
 *        owned by the Homepage Customization page instead.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireSuperAdmin } from "@/services/adminSession";
import { logSecurityEvent } from "@/services/securityLog";

export async function GET() {
  try {
    // Get-or-create: the very first admin to open this page creates the
    // row with schema defaults — no separate seed step needed.
    const settings = await prisma.systemSettings.upsert({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton" },
    });

    return NextResponse.json({ success: true, data: settings, message: "Policies fetched successfully." });
  } catch (error) {
    console.error("[Policies] Failed to fetch:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't load the policies. Please try again." },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
  try {
    const body = await request.json();

    // Fetched before the upsert so we can name exactly which policy
    // section(s) changed in the audit trail (Rule 6).
    const previousSettings = await prisma.systemSettings.findUnique({ where: { id: "singleton" } });

    const updatedSettings = await prisma.systemSettings.upsert({
      where: { id: "singleton" },
      update: {
        houseRules: body.houseRules ?? null,
        bookingPolicies: body.bookingPolicies ?? null,
        bookingPoliciesIntro: body.bookingPoliciesIntro ?? null,
        cancellationPolicy: body.cancellationPolicy ?? null,
        cancellationPolicyIntro: body.cancellationPolicyIntro ?? null,
        refundFullWindowDays: body.refundFullWindowDays ?? null,
        refundFullRefundFee: body.refundFullRefundFee ?? null,
        refundPartialWindowDays: body.refundPartialWindowDays ?? null,
        refundPartialPercent: body.refundPartialPercent ?? null,
        termsOfService: body.termsOfService ?? null,
        privacyPolicy: body.privacyPolicy ?? null,
        aboutPageContent: body.aboutPageContent ?? null,
        checkInTime: body.checkInTime ?? null,
        checkOutTime: body.checkOutTime ?? null,
        checkInNote: body.checkInNote ?? null,
        checkOutNote: body.checkOutNote ?? null,
        resortPhone: body.resortPhone ?? null,
        resortEmail: body.resortEmail ?? null,
        resortAddress: body.resortAddress ?? null,
        updatedBy: body.updatedBy || null,
      },
      create: {
        id: "singleton",
        houseRules: body.houseRules ?? null,
        bookingPolicies: body.bookingPolicies ?? null,
        bookingPoliciesIntro: body.bookingPoliciesIntro ?? null,
        cancellationPolicy: body.cancellationPolicy ?? null,
        cancellationPolicyIntro: body.cancellationPolicyIntro ?? null,
        refundFullWindowDays: body.refundFullWindowDays ?? null,
        refundFullRefundFee: body.refundFullRefundFee ?? null,
        refundPartialWindowDays: body.refundPartialWindowDays ?? null,
        refundPartialPercent: body.refundPartialPercent ?? null,
        termsOfService: body.termsOfService ?? null,
        privacyPolicy: body.privacyPolicy ?? null,
        aboutPageContent: body.aboutPageContent ?? null,
        checkInTime: body.checkInTime ?? null,
        checkOutTime: body.checkOutTime ?? null,
        checkInNote: body.checkInNote ?? null,
        checkOutNote: body.checkOutNote ?? null,
        resortPhone: body.resortPhone ?? null,
        resortEmail: body.resortEmail ?? null,
        resortAddress: body.resortAddress ?? null,
        updatedBy: body.updatedBy || null,
      },
    });

    // Name which policy section(s) actually changed rather than a generic
    // "policies updated" — matches the blueprint's diff-aware audit intent.
    const POLICY_FIELD_LABELS = {
      houseRules: "House Rules",
      bookingPolicies: "Booking Policies",
      bookingPoliciesIntro: "Booking Policies Intro",
      cancellationPolicy: "Cancellation Policy",
      cancellationPolicyIntro: "Cancellation Policy Intro",
      refundFullWindowDays: "Refund Table (full-refund window)",
      refundFullRefundFee: "Refund Table (processing fee)",
      refundPartialWindowDays: "Refund Table (partial-refund window)",
      refundPartialPercent: "Refund Table (partial-refund %)",
      termsOfService: "Terms & Conditions",
      privacyPolicy: "Privacy Policy",
      aboutPageContent: "About Page",
      checkInTime: "Check-In Time",
      checkOutTime: "Check-Out Time",
      checkInNote: "Check-In Note",
      checkOutNote: "Check-Out Note",
      resortPhone: "Contact Info (phone)",
      resortEmail: "Contact Info (email)",
      resortAddress: "Contact Info (address)",
    };
    const changedFields = Object.keys(POLICY_FIELD_LABELS).filter(
      (field) => previousSettings?.[field] !== updatedSettings[field]
    );

    const session = requireSuperAdmin(request);
    await logSecurityEvent({
      eventType: "admin_action",
      actor: session?.uid ?? null,
      request,
      details: changedFields.length
        ? `Updated policy section(s): ${changedFields.map((f) => POLICY_FIELD_LABELS[f]).join(", ")}.`
        : "Saved policies (no field changes detected).",
    });

    return NextResponse.json({ success: true, data: updatedSettings, message: "Policies saved successfully." });
  } catch (error) {
    console.error("[Policies] Failed to update:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't save the policies. Please try again." },
      { status: 500 }
    );
  }
}
