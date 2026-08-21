/**
 * FILE: app/system-setup-wizard/TelegramChatIdsCard.jsx
 * ROLE: Client Component — rendered inside RemainingEnvStep.jsx's
 *       "telegram" env group (Step 4)
 *
 * PURPOSE:
 * Lets the developer paste in the Admin Telegram Alert Chat ID(s)
 * during initial setup, right where the TELEGRAM_BOT_TOKEN
 * instructions already are — instead of having to remember to go set
 * it later in Super-Admin > Content > Policies & Content > Contact
 * Info (PoliciesClient.jsx). Both places write the same
 * SystemSettings.adminTelegramChatIds column, so this card is a
 * convenience for setup day, not a one-time-only field — unlike
 * BrandingCard.jsx's colors, this stays fully editable from Settings
 * after launch too (admins get added/removed over the resort's
 * lifetime).
 *
 * Multiple Telegram accounts CAN receive alerts from the same bot:
 * this is a single comma-separated text field, not limited to one
 * chat ID — every ID listed gets the exact same alert message,
 * independently, the moment a new Booking or WalkInInquiry comes in
 * (services/adminAlert.js -> services/telegram.js). No cap on how many.
 *
 * DATA FLOW:
 * 1. On mount -> GET /api/system-setup-wizard/telegram-chat-ids
 * 2. "Save Chat IDs" -> PUT /api/system-setup-wizard/telegram-chat-ids
 * 3. Never navigates anywhere itself — the parent step's own
 *    "Continue" button still owns hand-off to Step 5
 * 4. Receives showToast as a prop from RemainingEnvStep's own useToast
 *    instance (Rule 22.4 sub-component pattern) instead of mounting a
 *    second ToastStack alongside the parent's
 */
"use client";

import { useEffect, useState } from "react";

export default function TelegramChatIdsCard({ showToast }) {
  const [chatIds, setChatIds] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    async function fetchChatIds() {
      setIsLoading(true);
      try {
        const response = await fetch("/api/system-setup-wizard/telegram-chat-ids");
        const result = await response.json();
        if (result.success && result.data) {
          setChatIds(result.data.adminTelegramChatIds ?? "");
        }
      } catch {
        // Fails quiet — the field just renders empty; nothing here is
        // required to progress the wizard.
      } finally {
        setIsLoading(false);
      }
    }
    fetchChatIds();
  }, []);

  async function handleSaveChatIds() {
    setIsSaving(true);
    try {
      const response = await fetch("/api/system-setup-wizard/telegram-chat-ids", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminTelegramChatIds: chatIds }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        showToast("✕ " + (result.message ?? "Couldn't save the Telegram chat IDs."), "error");
        return;
      }

      // Reflect the server's cleaned-up version (trimmed, normalized
      // spacing) back into the field, same as BrandingCard would after
      // a successful save.
      setChatIds(result.data.adminTelegramChatIds ?? "");
      showToast("✓ " + result.message, "success");
    } catch {
      showToast("✕ We couldn't reach the server. Please try again.", "error");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="setupWizardCard setupWizardSubStepCard">
      <h2 className="setupWizardSubStepTitle">Set Admin Telegram Alert Chat IDs (optional)</h2>
      <p className="setupWizardBody">
        Once <code>TELEGRAM_BOT_TOKEN</code> above is set (Step B) and each admin has started a
        chat with the bot (Step D), paste their chat ID(s) here — this saves directly to the
        database, same field Super-Admin &gt; Content &gt; Policies &amp; Content &gt; Contact Info
        edits later, so you don&apos;t have to leave the wizard to turn alerts on. You can also
        skip this and set it there afterward instead — either place works, and both stay in sync
        since they&apos;re the same saved value.
      </p>
      <p className="setupWizardBody">
        <strong>Yes, multiple Telegram accounts can get alerts from the same bot</strong> — this
        is one field, not one-chat-ID-only: separate each admin&apos;s chat ID with a comma (e.g.{" "}
        <code>123456789, 987654321</code>) and every one of them gets the exact same alert message
        whenever a new booking or walk-in inquiry comes in. There&apos;s no limit on how many chat
        IDs you can add.
      </p>

      {isLoading ? (
        <p className="setupWizardBody">Loading saved chat IDs…</p>
      ) : (
        <>
          <div className="setupWizardFormField">
            <label htmlFor="wizardTelegramChatIds">Admin Telegram Alert Chat IDs</label>
            <input
              id="wizardTelegramChatIds"
              type="text"
              value={chatIds}
              onChange={(event) => setChatIds(event.target.value)}
              placeholder="e.g. 123456789, 987654321"
            />
            <p className="setupWizardFormHint">
              Leave blank to keep Telegram alerts off. Get a chat ID by having that admin message{" "}
              <strong>@userinfobot</strong> in Telegram — it replies instantly with their numeric ID.
            </p>
          </div>

          <button
            type="button"
            className="setupWizardButtonSecondary"
            onClick={handleSaveChatIds}
            disabled={isSaving}
          >
            {isSaving ? "Saving…" : "Save Chat IDs"}
          </button>
        </>
      )}
    </div>
  );
}
