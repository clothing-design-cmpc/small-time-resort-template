/**
 * FILE: app/superAdmin/(protected)/settings/booking-rules/RebookingPolicySection.jsx
 * ROLE: Super-admin only — protected by proxy.js auth guard
 *
 * PURPOSE:
 * Section 7 of Booking Rules & Configuration — the Global Rebooking
 * Policy. ONE resort-wide setting (SystemSettings, see
 * services/rebookingPolicy.js) that governs every booking:
 *   - How many times a single booking can be self-service rebooked
 *     before the limit action below kicks in (blank = unlimited).
 *   - Whether the deposit becomes non-refundable immediately on the
 *     FIRST rebooking, regardless of the normal cancellation window.
 *   - What happens once a guest reaches the limit: either the booking
 *     is simply locked (non-refundable, no further rebooking) or it is
 *     forfeited outright (cancelled, deposit kept, dates released).
 * This same policy is enforced server-side by
 * app/api/bookings/manage/reschedule/route.js and summarized as
 * guest-facing copy on the visitor Policies page and booking
 * confirmation screens — this form only edits the numbers/toggle.
 *
 * DATA FLOW:
 * 1. useRebookingPolicy() fetches the current policy on mount
 * 2. Saving PUTs the whole policy object in one request and refetches
 */
"use client";

import { useState } from "react";
import { useRebookingPolicy } from "@/hooks/useRebookingPolicy";

const LIMIT_ACTION_OPTIONS = [
  { value: "non_refundable", label: "Keep the booking — mark the deposit non-refundable, no further rebooking" },
  { value: "forfeit", label: "Forfeit the booking — cancel it, keep the deposit, release the dates" },
];

export default function RebookingPolicySection({ showToast }) {
  const { policy, isLoading, error, updatePolicy } = useRebookingPolicy();

  const [maxRebookingsDraft, setMaxRebookingsDraft] = useState("");
  const [nonRefundableOnFirstDraft, setNonRefundableOnFirstDraft] = useState(false);
  const [limitActionDraft, setLimitActionDraft] = useState("non_refundable");
  const [hasHydrated, setHasHydrated] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Sync the draft fields once the real policy loads, without
  // clobbering the admin's in-progress edits on a later re-render.
  if (!isLoading && !hasHydrated) {
    setMaxRebookingsDraft(policy.maxRebookingsAllowed == null ? "" : String(policy.maxRebookingsAllowed));
    setNonRefundableOnFirstDraft(policy.rebookingNonRefundableOnFirst);
    setLimitActionDraft(policy.rebookingLimitAction);
    setHasHydrated(true);
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      await updatePolicy({
        maxRebookingsAllowed: maxRebookingsDraft.trim() === "" ? null : Number(maxRebookingsDraft),
        rebookingNonRefundableOnFirst: nonRefundableOnFirstDraft,
        rebookingLimitAction: limitActionDraft,
      });
      showToast("✓ Rebooking policy updated successfully.", "success");
    } catch (submitError) {
      const message = submitError?.response?.data?.message || "We couldn't save the rebooking policy. Please try again.";
      showToast(`✕ ${message}`, "error");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="bookingRulesSection">
      <div className="bookingRulesSectionHeaderRow">
        <div>
          <h2 className="bookingRulesSectionTitle">Section 8: Rebooking Policy</h2>
          <p className="bookingRulesSectionSubtitle">
            Controls how many times a guest can move a confirmed booking to new dates through the self-service
            "Manage My Booking" widget, and what happens once they've used up their rebookings.
          </p>
        </div>
      </div>

      {isLoading && <p className="bookingRulesHint">Loading rebooking policy…</p>}
      {!isLoading && error && <p className="bookingRulesFormError">{error}</p>}

      {!isLoading && !error && (
        <div className="bookingRulesForm">
          <div className="bookingRulesFormRow">
            <div className="bookingRulesFormField">
              <label htmlFor="maxRebookingsInput">Max Rebookings Allowed</label>
              <input
                id="maxRebookingsInput"
                type="number"
                min="1"
                max="50"
                placeholder="Unlimited"
                value={maxRebookingsDraft}
                onChange={(event) => setMaxRebookingsDraft(event.target.value)}
              />
              <p className="bookingRulesHint">Leave blank for unlimited rebookings per booking.</p>
            </div>

            <div className="bookingRulesFormField">
              <label htmlFor="nonRefundableOnFirstToggle">Non-Refundable On First Rebook</label>
              <label className="bookingRulesToggleRow" htmlFor="nonRefundableOnFirstToggle">
                <input
                  id="nonRefundableOnFirstToggle"
                  type="checkbox"
                  checked={nonRefundableOnFirstDraft}
                  onChange={(event) => setNonRefundableOnFirstDraft(event.target.checked)}
                />
                Make the deposit non-refundable as soon as the guest rebooks for the first time
              </label>
            </div>
          </div>

          <div className="bookingRulesFormField">
            <label htmlFor="limitActionSelect">When The Limit Is Reached</label>
            <select
              id="limitActionSelect"
              value={limitActionDraft}
              onChange={(event) => setLimitActionDraft(event.target.value)}
            >
              {LIMIT_ACTION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="bookingRulesHint">
              Only applies once "Max Rebookings Allowed" above is set to a number — with it left blank, guests can
              always rebook and this choice has no effect.
            </p>
          </div>

          <div className="bookingRulesFormActions">
            <button type="button" className="bookingRulesButton bookingRulesButton--primary" onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving…" : "Save Rebooking Policy"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
