/**
 * FILE: services/emailLogs.js
 * PURPOSE:
 * Central read/write layer for the EmailLog table — records every
 * outbound email attempt made through services/emailjs.js's
 * sendGeneralEmail() (sent or failed), and powers the super-admin
 * Email Logs page's list + "Resend" action.
 *
 * DATA FLOW:
 * 1. sendGeneralEmail() calls recordEmailAttempt() right after every
 *    send attempt — including the early-return case where required
 *    config or a recipient is missing. This is the ONLY place email
 *    attempts are ever written, so every email sent through this app
 *    shows up here automatically with no per-call-site logging needed
 *    beyond passing an emailType label.
 * 2. The super-admin Email Logs page reads via listEmailLogs().
 * 3. Clicking "Resend" on a row calls resendEmailLog(), which re-reads
 *    that row's stored payload, applies any admin edits on top, and
 *    calls sendGeneralEmail() again with the SAME emailType and
 *    relatedBookingId — producing a brand-new EmailLog row (never an
 *    edit of the old one) so the full history of every attempt is
 *    preserved, while the original row's retryCount increments so the
 *    admin can see at a glance it was retried.
 *
 * Server-side only — never import this in a "use client" file.
 */
import { prisma } from "./prisma.js";

/**
 * recordEmailAttempt
 * Writes one EmailLog row for a single send attempt. Never throws — a
 * failure to WRITE the log must never break the actual email send
 * flow already in progress (same never-break-the-request principle as
 * services/securityLog.js's logSecurityEvent()).
 *
 * @param {object} input
 * @param {string} input.emailType
 * @param {"sent"|"failed"} input.status
 * @param {string} input.toEmail
 * @param {string} input.subject
 * @param {string|null} [input.errorMessage]
 * @param {string|null} [input.relatedBookingId]
 * @param {object} input.payload - the exact sendGeneralEmail() params used
 * @param {string|null} [input.resendOfLogId] - set when this attempt IS a resend
 */
export async function recordEmailAttempt({
  emailType = "general",
  status,
  toEmail,
  subject,
  errorMessage = null,
  relatedBookingId = null,
  payload,
  resendOfLogId = null,
}) {
  try {
    const logRow = await prisma.emailLog.create({
      data: {
        emailType,
        status,
        toEmail: toEmail ?? "",
        subject: subject ?? "",
        errorMessage,
        relatedBookingId,
        payload,
        resendOfLogId,
      },
    });

    // A resend — success or failure — still counts as a retry of the
    // original row. Bump its counter so the admin can see at a glance
    // how many times that particular failure has been retried.
    // Non-fatal if the original row no longer exists (e.g. pruned by
    // a future retention policy) — the new attempt row above already
    // recorded successfully either way.
    if (resendOfLogId) {
      await prisma.emailLog
        .update({
          where: { id: resendOfLogId },
          data: { retryCount: { increment: 1 } },
        })
        .catch(() => {});
    }

    return logRow;
  } catch (error) {
    console.error("[emailLogs] Failed to write EmailLog row:", error.message);
    return null;
  }
}

const PAGE_SIZE = 20;

/**
 * listEmailLogs
 * Paginated, newest-first, optionally filtered by status and/or
 * emailType — powers GET /api/admin/email-logs.
 *
 * @param {object} [options]
 * @param {number} [options.page]
 * @param {string|null} [options.status] - "sent" | "failed"
 * @param {string|null} [options.emailType]
 */
export async function listEmailLogs({ page = 1, status = null, emailType = null } = {}) {
  const where = {};
  if (status) where.status = status;
  if (emailType) where.emailType = emailType;

  const [emailLogs, totalCount] = await Promise.all([
    prisma.emailLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.emailLog.count({ where }),
  ]);

  return {
    emailLogs,
    page,
    pageSize: PAGE_SIZE,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / PAGE_SIZE)),
  };
}

/**
 * resendEmailLog
 * Re-sends a previously logged email. `overrides` lets the admin edit
 * any field before resending (e.g. fixing a typo'd address that
 * caused the original failure) — anything NOT overridden falls back
 * to exactly what was stored on the original row, so the form the
 * admin sees is always fully autofilled from the original attempt.
 *
 * The dynamic import of services/emailjs.js below (instead of a
 * top-level import) avoids a circular top-level import between this
 * file and emailjs.js — emailjs.js imports recordEmailAttempt from
 * this file at the top level, so this file resolves the reverse
 * direction lazily, only when a resend actually happens.
 *
 * @param {string} logId - the EmailLog row being resent
 * @param {object} [overrides] - any subset of sendGeneralEmail's params
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function resendEmailLog(logId, overrides = {}) {
  const { sendGeneralEmail } = await import("./emailjs.js");

  const originalLog = await prisma.emailLog.findUnique({ where: { id: logId } });
  if (!originalLog) {
    return { success: false, message: "That email log entry no longer exists." };
  }

  const mergedParams = { ...originalLog.payload, ...overrides };

  if (!mergedParams.toEmail) {
    return { success: false, message: "A recipient email address is required to resend." };
  }

  const sent = await sendGeneralEmail({
    ...mergedParams,
    emailType: originalLog.emailType,
    relatedBookingId: originalLog.relatedBookingId,
    resendOfLogId: originalLog.id,
  });

  return {
    success: sent,
    message: sent
      ? `Email resent to ${mergedParams.toEmail}.`
      : "The resend attempt also failed. Check the newest log entry below for details.",
  };
}
