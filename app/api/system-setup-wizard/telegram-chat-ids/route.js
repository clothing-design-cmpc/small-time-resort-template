/**
 * FILE: app/api/system-setup-wizard/telegram-chat-ids/route.js
 * ROLE: Wizard-session only (Step 4 of app/system-setup-wizard) — no
 *       account, no role. Gated by isSetupWizardLocked() AND
 *       hasWizardSession(), same double-gate pattern as
 *       branding/route.js and confirm-admin/route.js.
 *
 * PURPOSE:
 * Lets RemainingEnvStep.jsx's TelegramChatIdsCard read and save the
 * Admin Telegram Alert Chat IDs directly on the singleton
 * SystemSettings row, during initial setup — instead of only pointing
 * the developer to Super-Admin > Content > Policies & Content > Contact
 * Info (PoliciesClient.jsx) after the wizard is already done. Both this
 * route and the admin-panel one (/api/superAdmin/content/policies)
 * write the exact same SystemSettings.adminTelegramChatIds column, so
 * whichever one is used first, the other stays in sync automatically —
 * unlike branding/route.js's colors, this field is NOT a one-time-only
 * wizard field; it stays editable from Settings after launch too, since
 * admins get added/removed over the life of the resort, not just at
 * setup.
 *
 * "Multiple Telegram accounts" support: adminTelegramChatIds is a
 * single comma-separated string column (not a relation table) — every
 * chat ID in the list gets the exact same alert message, sent
 * independently, the moment a new Booking or WalkInInquiry comes in
 * (see services/adminAlert.js -> services/telegram.js). There's no
 * hard cap on how many chat IDs can be comma-separated here.
 *
 * DATA FLOW:
 * 1. GET  -> get-or-create the singleton row, return
 *            { adminTelegramChatIds } only (never the full settings row)
 * 2. PUT  -> validates and updates that same field only
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { isSetupWizardLocked } from "@/services/setupWizardStatus";
import { hasWizardSession } from "@/services/wizardSession";

// Each comma-separated entry must be digits only — Telegram numeric
// chat IDs can be negative (group chats) or positive (personal DMs
// with the bot), so a leading "-" is allowed, but nothing else.
const CHAT_ID_PATTERN = /^-?\d+$/;

/**
 * assertWizardOpen
 * Shared double-gate check for both handlers below — returns a 404/401
 * NextResponse to short-circuit with, or null if the request may
 * proceed. Same reasoning as branding/route.js: never trust a
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
    // Get-or-create — same pattern as branding/route.js, so the very
    // first load always has something to show (blank/null is fine;
    // Telegram alerts are entirely optional).
    const settings = await prisma.systemSettings.upsert({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton" },
      select: { adminTelegramChatIds: true },
    });

    return NextResponse.json({
      success: true,
      data: settings,
      message: "Telegram alert chat IDs fetched successfully.",
    });
  } catch (error) {
    console.error("[api/system-setup-wizard/telegram-chat-ids] GET failed:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't load the saved Telegram chat IDs. Please try again." },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
  const gateResponse = await assertWizardOpen(request);
  if (gateResponse) return gateResponse;

  try {
    const body = await request.json();
    const rawValue = typeof body.adminTelegramChatIds === "string" ? body.adminTelegramChatIds : "";

    // Blank is always allowed — it's how this optional alert channel
    // gets turned off entirely (see services/adminAlert.js's
    // early-return guard on an empty list).
    const trimmedValue = rawValue.trim();
    let normalizedValue = "";

    if (trimmedValue) {
      // Split, trim each entry, drop empty pieces from stray commas
      // (e.g. a trailing "123, "), then validate every remaining piece
      // is a plain numeric Telegram chat ID before saving anything.
      const entries = trimmedValue
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);

      const invalidEntries = entries.filter((entry) => !CHAT_ID_PATTERN.test(entry));
      if (invalidEntries.length > 0) {
        return NextResponse.json(
          {
            success: false,
            data: null,
            message: `These don't look like valid Telegram chat IDs: ${invalidEntries.join(", ")}. Chat IDs are numbers only (message @userinfobot in Telegram to get yours).`,
          },
          { status: 400 }
        );
      }

      // Save the cleaned, comma-separated list back — normalizes
      // spacing/stray commas the developer may have typed.
      normalizedValue = entries.join(", ");
    }

    const updatedSettings = await prisma.systemSettings.upsert({
      where: { id: "singleton" },
      update: { adminTelegramChatIds: normalizedValue },
      create: { id: "singleton", adminTelegramChatIds: normalizedValue },
      select: { adminTelegramChatIds: true },
    });

    return NextResponse.json({
      success: true,
      data: updatedSettings,
      message: normalizedValue
        ? "Telegram alert chat IDs saved successfully."
        : "Telegram alerts turned off (no chat IDs saved).",
    });
  } catch (error) {
    console.error("[api/system-setup-wizard/telegram-chat-ids] PUT failed:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't save the Telegram chat IDs. Please try again." },
      { status: 500 }
    );
  }
}
