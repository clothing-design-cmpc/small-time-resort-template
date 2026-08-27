/**
 * FILE: services/vaultTelegramAlerts.js
 * PURPOSE:
 * Single place that builds and sends the Telegram alert for every
 * vault-security code the owner needs to act on:
 *   1. A freshly-rotated vault passphrase (manual button, the 30-day
 *      cron, or a Gatekeeper 3 breach) — services/vaultPassphrase.js
 *      and services/breachResponse.js both call sendVaultPassphraseTelegramAlert()
 *      after every rotation, so every code path that ever generates a
 *      new passphrase sends it here too, not just some of them.
 *   2. A Gatekeeper 3 pre-lockdown login-anomaly OTP code —
 *      services/loginAnomalyOtp.js calls sendLoginAnomalyOtpTelegramAlert()
 *      right alongside its existing email send.
 *   3. The vault's own second-factor OTP (the /system-vault/[slug]/otp
 *      screen, after the passphrase is accepted) — services/vaultOtp.js
 *      calls sendVaultOtpTelegramAlert() right alongside its existing
 *      email send.
 *
 * Recipients and the low-level send call reuse the same
 * SystemSettings.adminTelegramChatIds list (comma-separated) and
 * services/telegram.js's sendTelegramMessage() that
 * services/bookingTelegramAlerts.js already uses — same "blank/unset
 * silently disables this, not an error" pattern. Best-effort: never
 * throws, never blocks the caller, and a Telegram failure never
 * cancels the email that was already sent alongside it.
 *
 * This file is server-side only — never import it in a "use client" file.
 */

import { prisma } from "./prisma.js";
import { sendTelegramMessage } from "./telegram.js";

/**
 * getRecipients
 * Reads SystemSettings.adminTelegramChatIds (comma-separated) and
 * returns a clean, trimmed, non-empty array — same parsing
 * services/bookingTelegramAlerts.js's getRecipientsAndMessengerLink()
 * already uses.
 */
async function getRecipients() {
  const settings = await prisma.systemSettings.findUnique({
    where: { id: "singleton" },
    select: { adminTelegramChatIds: true },
  });

  return (settings?.adminTelegramChatIds ?? "")
    .split(",")
    .map((chatId) => chatId.trim())
    .filter(Boolean);
}

/**
 * sendToAllRecipients
 * Fires sendTelegramMessage() at every configured chat ID in
 * parallel. Returns true if at least one send succeeded (mirrors
 * services/bookingTelegramAlerts.js's own "any success counts" logic)
 * — false if no recipients are configured or every send failed.
 */
async function sendToAllRecipients(message) {
  const recipients = await getRecipients();

  if (recipients.length === 0) {
    console.error("[vaultTelegramAlerts] No adminTelegramChatIds configured — skipping Telegram send.");
    return false;
  }

  const results = await Promise.all(
    recipients.map((chatId) => sendTelegramMessage({ chatId, message }))
  );

  return results.some(Boolean);
}

/**
 * sendVaultPassphraseTelegramAlert
 * Sends the brand-new vault passphrase itself over Telegram — a
 * second, independent channel alongside the email
 * (services/emailAlert.js's sendVaultPassphraseRotationEmail()), so
 * the owner can still recover the vault if the email is missed,
 * delayed, or lands in spam. Deliberately includes the plaintext
 * passphrase, unlike sendVaultWebhookAlert()'s existing generic
 * "a rotation happened" ping — per the owner's explicit request, this
 * channel is meant to be a real, usable second copy of the code, not
 * just a notification.
 *
 * @param {object} input
 * @param {string} input.newPassphrase - plaintext, only ever passed here to be sent
 * @param {string} input.reason - one-liner, e.g. "Gatekeeper 3 — Anomalous admin login"
 */
export async function sendVaultPassphraseTelegramAlert({ newPassphrase, reason }) {
  const message =
    `🔑 New vault passphrase generated\n` +
    `Reason: ${reason}\n\n` +
    `${newPassphrase}\n\n` +
    `This replaces every passphrase that came before it. Keep it private.`;

  return sendToAllRecipients(message);
}

/**
 * sendLoginAnomalyOtpTelegramAlert
 * Sends the Gatekeeper 3 pre-lockdown login-anomaly OTP code over
 * Telegram, alongside services/emailAlert.js's
 * sendLoginAnomalyOtpEmail() — same reasoning as above: a second
 * channel for a code that expires in a few minutes, so a slow or
 * missed email doesn't cost the owner their confirmation window.
 *
 * @param {object} input
 * @param {string} input.code - plaintext 6-digit code
 * @param {string} input.attemptedEmail - which admin account this login used
 * @param {string|null} input.anomalyReason
 * @param {number} input.expiryMinutes
 */
export async function sendLoginAnomalyOtpTelegramAlert({ code, attemptedEmail, anomalyReason, expiryMinutes }) {
  const message =
    `🔐 Sign-in confirmation needed\n` +
    `Account: ${attemptedEmail}\n` +
    `Reason: ${anomalyReason ?? "New device or location"}\n\n` +
    `Code: ${code}\n` +
    `Expires in ${expiryMinutes} minutes.\n\n` +
    `Enter this on the sign-in screen only if this was you.`;

  return sendToAllRecipients(message);
}

/**
 * sendVaultOtpTelegramAlert
 * Sends the vault's own second-factor OTP code over Telegram, alongside
 * services/vaultOtp.js's existing sendGeneralEmail() call — same
 * reasoning as every other code in this file: a second, independent
 * channel so a missed/delayed/spam-filtered email is never the only
 * way to finish unlocking the vault before this short-lived code
 * expires.
 *
 * @param {object} input
 * @param {string} input.code - plaintext 12-character code
 * @param {number} input.expiryMinutes
 */
export async function sendVaultOtpTelegramAlert({ code, expiryMinutes }) {
  const message =
    `🔒 Vault verification code\n\n` +
    `Code: ${code}\n` +
    `Expires in ${expiryMinutes} minute${expiryMinutes === 1 ? "" : "s"}.\n\n` +
    `Enter this on the vault login screen to continue.`;

  return sendToAllRecipients(message);
}