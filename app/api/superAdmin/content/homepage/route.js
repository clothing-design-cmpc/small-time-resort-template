/**
 * FILE: app/api/superAdmin/content/homepage/route.js
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * GET -> returns the homepage/SEO subset of the singleton
 *        SystemSettings row, creating it with schema defaults on
 *        first request if it doesn't exist yet (get-or-create — same
 *        pattern as BookingRules/Policies).
 * PUT -> updates that subset (blueprint Page 9: Hero, Featured Rooms,
 *        Testimonials Section, CTA Section, SEO & Metadata). Deletes
 *        the old R2 hero/OG image if either was replaced. Never
 *        touches the policy/contact fields that also live on this
 *        row — those are owned by the Policies page instead.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { deleteFromR2 } from "@/services/r2";

export async function GET() {
  try {
    // Get-or-create: the very first admin to open this page creates the
    // row with schema defaults — no separate seed step needed.
    const settings = await prisma.systemSettings.upsert({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton" },
    });

    return NextResponse.json({ success: true, data: settings, message: "Homepage settings fetched successfully." });
  } catch (error) {
    console.error("[Homepage] Failed to fetch:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't load the homepage settings. Please try again." },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
  try {
    const body = await request.json();

    const existingSettings = await prisma.systemSettings.upsert({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton" },
    });

    const updatedSettings = await prisma.systemSettings.update({
      where: { id: "singleton" },
      data: {
        heroTagline: body.heroTagline ?? existingSettings.heroTagline,
        heroImageUrl: body.heroImageUrl ?? existingSettings.heroImageUrl,
        heroImageKey: body.heroImageKey ?? existingSettings.heroImageKey,
        ctaSectionHeading: body.ctaSectionHeading ?? existingSettings.ctaSectionHeading,
        ctaSectionSubtext: body.ctaSectionSubtext ?? existingSettings.ctaSectionSubtext,
        ctaButtonText: body.ctaButtonText ?? existingSettings.ctaButtonText,
        ctaSectionVisible: body.ctaSectionVisible ?? existingSettings.ctaSectionVisible,
        featuredRoomIds: body.featuredRoomIds ?? existingSettings.featuredRoomIds,
        testimonialsSectionEnabled: body.testimonialsSectionEnabled ?? existingSettings.testimonialsSectionEnabled,
        testimonialsSectionCount: body.testimonialsSectionCount ?? existingSettings.testimonialsSectionCount,
        testimonialsFeaturedOnly: body.testimonialsFeaturedOnly ?? existingSettings.testimonialsFeaturedOnly,
        siteTitle: body.siteTitle ?? existingSettings.siteTitle,
        siteDescription: body.siteDescription ?? existingSettings.siteDescription,
        ogImageUrl: body.ogImageUrl ?? existingSettings.ogImageUrl,
        ogImageKey: body.ogImageKey ?? existingSettings.ogImageKey,
        updatedBy: body.updatedBy || existingSettings.updatedBy,
      },
    });

    // Either image was replaced with a new upload — remove the old R2
    // file so the bucket never accumulates orphaned images.
    if (body.heroImageKey && existingSettings.heroImageKey && body.heroImageKey !== existingSettings.heroImageKey) {
      await deleteFromR2(existingSettings.heroImageKey);
    }
    if (body.ogImageKey && existingSettings.ogImageKey && body.ogImageKey !== existingSettings.ogImageKey) {
      await deleteFromR2(existingSettings.ogImageKey);
    }

    return NextResponse.json({ success: true, data: updatedSettings, message: "Homepage settings saved successfully." });
  } catch (error) {
    console.error("[Homepage] Failed to update:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't save the homepage settings. Please try again." },
      { status: 500 }
    );
  }
}
