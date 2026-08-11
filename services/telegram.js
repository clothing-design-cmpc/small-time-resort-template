/**
 * FILE: services/telegram.js
 * PURPOSE:
 * Low-level wrapper around the Telegram Bot API's sendMessage endpoint.
 * This file only knows how to send one text to one chat; it never
 * decides WHO gets notified or WHAT the message says — that's
 * services/adminAlert.js.
 *
 * Replaces the earlier Semaphore SMS integration (services/semaphore.js) —
 * Telegram Bot messages are completely free with no per-message cost or
 * volume limit, unlike SMS gateways. The only setup cost is one-time:
 * each admin recipient needs the Telegram app and to have started a
 * chat with the bot once (see the setup steps below) so Telegram will
 * allow the bot to message them.
 *
 * SETUP (one-time):
 * 1. In Telegram, message @BotFather -> /newbot -> follow the prompts.
 *    BotFather replies with a bot token like
 *    "123456789:AAExampleTokenTextHere".
 * 2. Fill in .env.local: TELEGRAM_BOT_TOKEN=<that token>.
 * 3. Each admin who wants alerts must open a chat with the new bot
 *    (search its @username, tap Start) — Telegram bots cannot message
 *    a user who has never started a conversation with them.
 * 4. Get each admin's numeric chat ID: message the bot anything, then
 *    open https://api.telegram.org/bot<TOKEN>/getUpdates in a browser
 *    and read the "chat":{"id": ...} value from the JSON response. Or,
 *    simpler: have each admin message @userinfobot, which replies with
 *    their own chat ID directly.
 * 5. Enter the chat ID(s) in Super-Admin > Content > Policies & Content
 *    > Contact Info > "Admin Telegram Alert Chat IDs".
 *
 * This file is server-side only — never import it in a "use client" file.
 */

/**
 * sendTelegramMessage
 * Sends one plain-text message to one Telegram chat via the Bot API.
 * Best-effort — never throws. Returns true on a confirmed send, false
 * on any failure (missing config, bad chat ID, network error, non-2xx
 * response) so the caller can decide whether to log it, without this
 * function ever being the thing that breaks a request.
 *
 * @param {object} input
 * @param {string} input.chatId - Numeric Telegram chat ID (as a string
 *                                 or number) — the recipient must have
 *                                 already started a chat with the bot.
 * @param {string} input.message - Plain text body. No length limit
 *                                 worth worrying about here (Telegram
 *                                 caps at 4096 chars, far more than an
 *                                 alert message needs).
 */
export async function sendTelegramMessage({ chatId, message }) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    console.error("[telegram] TELEGRAM_BOT_TOKEN is not set — skipping message send.");
    return false;
  }

  if (!chatId || !message) {
    console.error("[telegram] sendTelegramMessage called without a chatId or message — skipping.");
    return false;
  }

  const endpoint = `https://api.telegram.org/bot${botToken}/sendMessage`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      console.error(`[telegram] Send failed (${response.status}) for chat ${chatId}:`, errorBody);
      return false;
    }

    return true;
  } catch (error) {
    console.error(`[telegram] Send threw for chat ${chatId}:`, error.message);
    return false;
  }
}
