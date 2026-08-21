/**
 * FILE: app/api/superAdmin/content/policies/telegram-send/route.js
 * ROLE: Super-admin only — verified via requireSuperAdmin(), not middleware.js
 *
 * PURPOSE:
 * Powers the "Send Message Now" button on Super-Admin > Content >
 * Policies & Content > Contact Info > Admin Telegram Alerts. Lets an
 * admin send an arbitrary, one-off text message directly to every
 * configured Telegram chat ID — distinct from the automatic booking
 * lifecycle alerts in services/bookingTelegramAlerts.js, which fire on
 * their own with fixed templates. This route is manual and free-form
 * (e.g. "We're closed this weekend for maintenance").
 *
 * DATA FLOW:
 * 1. Admin types a message in the Policies page's Telegram box, clicks
 *    "Send Message Now"
 * 2. POST { message } here
 * 3. requireSuperAdmin() verifies the session
 * 4. SystemSettings.adminTelegramChatIds is read and parsed the same
 *    way services/adminAlert.js does
 * 5. Message is sent to every configured chat ID in parallel via
 *    services/telegram.js's sendTelegramMessage()
 * 6. Reports back exactly how many of the configured recipients
 *    actually received it, so the admin isn't left guessing on a
 *    partial failure
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/services/prisma";
import { requireSuperAdmin } from "@/services/adminSession";
import { sendTelegramMessage } from "@/services/telegram";
import { logSecurityEvent } from "@/services/securityLog";

const sendMessageSchema = z.object({
  message: z.string().trim().min(1, "Please type a message.").max(4000),
});

export async function POST(request) {
  const session = requireSuperAdmin(request);
  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "You don't have permission to do this." },
      { status: 401 }
    );
  }

  let payload;
  try {
    payload = sendMessageSchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json(
      { success: false, data: null, message: error?.issues?.[0]?.message ?? "Please type a message." },
      { status: 400 }
    );
  }

  const settings = await prisma.systemSettings.findUnique({
    where: { id: "singleton" },
    select: { adminTelegramChatIds: true },
  });

  const recipients = (settings?.adminTelegramChatIds ?? "")
    .split(",")
    .map((chatId) => chatId.trim())
    .filter(Boolean);

  if (recipients.length === 0) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        message: "No Telegram chat IDs are configured yet — add at least one above first.",
      },
      { status: 400 }
    );
  }

  const results = await Promise.all(
    recipients.map((chatId) => sendTelegramMessage({ chatId, message: payload.message }))
  );
  const successCount = results.filter(Boolean).length;

  // Audit trail (Rule 6) — who manually broadcast a Telegram message, and when.
  await logSecurityEvent({
    eventType: "admin_action",
    actor: session.uid,
    request,
    details: `Sent a manual Telegram message to ${successCount}/${recipients.length} admin chat ID(s).`,
  });

  if (successCount === 0) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        message: "Failed to deliver to any recipient — check TELEGRAM_BOT_TOKEN and the chat IDs.",
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    success: true,
    data: { successCount, totalCount: recipients.length },
    message:
      successCount === recipients.length
        ? `✓ Message sent to all ${successCount} recipient(s).`
        : `⚠ Sent to ${successCount}/${recipients.length} recipient(s) — some chat IDs may be invalid.`,
  });
}
