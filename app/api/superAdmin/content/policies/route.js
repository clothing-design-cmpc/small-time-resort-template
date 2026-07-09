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

    const updatedSettings = await prisma.systemSettings.upsert({
      where: { id: "singleton" },
      update: {
        houseRules: body.houseRules ?? null,
        cancellationPolicy: body.cancellationPolicy ?? null,
        termsOfService: body.termsOfService ?? null,
        privacyPolicy: body.privacyPolicy ?? null,
        aboutPageContent: body.aboutPageContent ?? null,
        resortPhone: body.resortPhone ?? null,
        resortEmail: body.resortEmail ?? null,
        resortAddress: body.resortAddress ?? null,
        updatedBy: body.updatedBy || null,
      },
      create: {
        id: "singleton",
        houseRules: body.houseRules ?? null,
        cancellationPolicy: body.cancellationPolicy ?? null,
        termsOfService: body.termsOfService ?? null,
        privacyPolicy: body.privacyPolicy ?? null,
        aboutPageContent: body.aboutPageContent ?? null,
        resortPhone: body.resortPhone ?? null,
        resortEmail: body.resortEmail ?? null,
        resortAddress: body.resortAddress ?? null,
        updatedBy: body.updatedBy || null,
      },
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
