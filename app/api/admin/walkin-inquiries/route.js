/**
 * FILE: app/api/admin/walkin-inquiries/route.js
 * ROLE: Super-admin only — verified via requireSuperAdmin(), not middleware.js
 *
 * PURPOSE:
 * Lists every WalkInInquiry lead, newest first, for the super-admin
 * Walk-in Inquiries page — staff use this to see who's waiting for a
 * callback and their phone number, then call them and log the actual
 * reservation as a Booking once confirmed.
 *
 * DATA FLOW:
 * 1. app/superAdmin/(protected)/walkin-inquiries/page.jsx fetches this
 *    on mount
 * 2. requireSuperAdmin() decodes the session cookie — middleware.js's
 *    matcher only covers /superAdmin/* pages, not /api/*
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireSuperAdmin } from "@/services/adminSession";

export async function GET(request) {
  const session = requireSuperAdmin(request);
  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "You don't have permission to view this page." },
      { status: 401 }
    );
  }

  try {
    const inquiries = await prisma.walkInInquiry.findMany({
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      success: true,
      data: { inquiries },
      message: "Walk-in inquiries fetched successfully.",
    });
  } catch (error) {
    console.error("[api/admin/walkin-inquiries] Failed to fetch:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "Failed to load walk-in inquiries. Please try again." },
      { status: 500 }
    );
  }
}
