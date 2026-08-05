/**
 * FILE: app/api/system-setup-wizard/branding/route.js
 * ROLE: Wizard-session only (Step 3 of app/system-setup-wizard) — no
 *       account, no role. Gated by isSetupWizardLocked() AND
 *       hasWizardSession(), same double-gate pattern as confirm-admin.
 *
 * PURPOSE:
 * Lets AdminSetupStep.jsx's "Brand your resort" card read and save the
 * resort's display name (siteTitle) and 5-token brand color system
 * (brandAccentColor, brandSecondaryColor, brandBackgroundColor,
 * brandTextColor, brandBorderColor) directly on the singleton
 * SystemSettings row. The equivalent admin-panel route
 * (/api/superAdmin/content/homepage) can't be used here — it requires
 * a logged-in super-admin session cookie, which doesn't exist yet
 * this early in setup (the owner account was just created via
 * `npx prisma db seed`, not logged in). Optional and skippable —
 * never blocks progression to Step 4; every field already has a
 * schema-level default if left untouched.
 *
 * DATA FLOW:
 * 1. GET  -> get-or-create the singleton row, return { siteTitle,
 *            brandAccentColor, brandSecondaryColor,
 *            brandBackgroundColor, brandTextColor, brandBorderColor }
 *            only (never the full settings row)
 * 2. PUT  -> updates those same fields only
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { isSetupWizardLocked } from "@/services/setupWizardStatus";
import { hasWizardSession } from "@/services/wizardSession";

/**
 * assertWizardOpen
 * Shared double-gate check for both handlers below — returns a 404/401
 * NextResponse to short-circuit with, or null if the request may
 * proceed. Same reasoning as confirm-admin/route.js: never trust a
 * client-side-only check for a route this sensitive.
 */
async function assertWizardOpen(request) {
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
  return null;
}

export async function GET(request) {
  const gateResponse = await assertWizardOpen(request);
  if (gateResponse) return gateResponse;

  try {
    // Get-or-create — same pattern as the admin-panel homepage route,
    // so the very first load always has schema-default values to show.
    const settings = await prisma.systemSettings.upsert({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton" },
      select: {
        siteTitle: true,
        brandAccentColor: true,
        brandSecondaryColor: true,
        brandBackgroundColor: true,
        brandTextColor: true,
        brandBorderColor: true,
      },
    });

    return NextResponse.json({ success: true, data: settings, message: "Brand identity fetched successfully." });
  } catch (error) {
    console.error("[api/system-setup-wizard/branding] GET failed:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't load the resort's brand identity. Please try again." },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
  const gateResponse = await assertWizardOpen(request);
  if (gateResponse) return gateResponse;

  try {
    const body = await request.json();

    // Reject empty/whitespace-only resort names rather than saving a
    // blank header/footer/title across the whole site.
    const trimmedName = typeof body.siteTitle === "string" ? body.siteTitle.trim() : "";
    if (!trimmedName) {
      return NextResponse.json(
        { success: false, data: null, message: "Resort name can't be empty." },
        { status: 400 }
      );
    }

    // Basic 6-digit hex validation — a malformed value here would
    // silently break every CSS variable derived from it in
    // app/layout.jsx. Applied identically to all 5 brand color
    // fields; any field that fails validation is simply omitted from
    // the update so it falls back to whatever is already stored.
    const hexColorPattern = /^#[0-9a-fA-F]{6}$/;
    const validatedColors = {};
    for (const [bodyKey, columnKey] of [
      ["brandAccentColor", "brandAccentColor"],
      ["brandSecondaryColor", "brandSecondaryColor"],
      ["brandBackgroundColor", "brandBackgroundColor"],
      ["brandTextColor", "brandTextColor"],
      ["brandBorderColor", "brandBorderColor"],
    ]) {
      if (hexColorPattern.test(body[bodyKey] ?? "")) {
        validatedColors[columnKey] = body[bodyKey];
      }
    }

    const updatedSettings = await prisma.systemSettings.upsert({
      where: { id: "singleton" },
      update: {
        siteTitle: trimmedName,
        ...validatedColors,
      },
      create: {
        id: "singleton",
        siteTitle: trimmedName,
        ...validatedColors,
      },
      select: {
        siteTitle: true,
        brandAccentColor: true,
        brandSecondaryColor: true,
        brandBackgroundColor: true,
        brandTextColor: true,
        brandBorderColor: true,
      },
    });

    return NextResponse.json({ success: true, data: updatedSettings, message: "Brand identity saved successfully." });
  } catch (error) {
    console.error("[api/system-setup-wizard/branding] PUT failed:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't save the resort's brand identity. Please try again." },
      { status: 500 }
    );
  }
}
