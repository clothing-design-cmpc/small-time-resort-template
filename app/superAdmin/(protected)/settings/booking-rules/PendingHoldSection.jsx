/**
 * FILE: app/superAdmin/(protected)/settings/booking-rules/PendingHoldSection.jsx
 * ROLE: Super-admin only — protected by proxy.js auth guard
 *
 * PURPOSE:
 * Section 7 of Booking Rules & Configuration. Lets the super-admin set
 * the resort-wide "DP Countdown" (SystemSettings.pendingHoldHours) — how
 * many hours a brand-new "pending" booking holds its dates before
 * app/api/cron/booking-expiry/route.js auto-expires it.
 *
 * Saving a new value here NEVER affects a booking that is already
 * pending: each Booking's own pendingExpiresAt was already computed and
 * saved at ITS creation time (app/api/bookings/route.js), from whatever
 * this setting was back then. Only bookings created AFTER this save use
 * the new number. There is nothing to "conflict" with — no active hold
 * is re-timed, and saving a new value can never error out because of an
 * existing pending booking.
 *
 * DATA FLOW:
 * 1. usePendingHoldHours() fetches the current value on mount
 * 2. The input's onBlur calls updatePendingHoldHours() and shows a toast
 */
"use client";

import { useState } from "react";
import axios from "axios";
import { usePendingHoldHours } from "@/hooks/usePendingHoldHours";

export default function PendingHoldSection({ showToast }) {
  const { pendingHoldHours, isLoading, error, updatePendingHoldHours } = usePendingHoldHours();
  const [pendingHoldHoursDraft, setPendingHoldHoursDraft] = useState(undefined);
  const [isSweeping, setIsSweeping] = useState(false);

  /**
   * handleRunExpirySweepNow
   * Manually triggers app/api/cron/booking-expiry's exact sweep logic
   * (see services/bookingExpirySweep.js) via the super-admin-only
   * route. Exists because Vercel Cron never fires against localhost —
   * this is the only way to see auto-expiry/auto-cancellation actually
   * happen while developing, instead of waiting for a deploy.
   */
  async function handleRunExpirySweepNow() {
    setIsSweeping(true);
    try {
      const response = await axios.post("/api/superAdmin/settings/booking-rules/run-expiry-sweep");
      showToast(`✓ ${response.data.message}`, "success");
    } catch (submitError) {
      const message = submitError?.response?.data?.message || "Failed to run the expiry sweep.";
      showToast(`✕ ${message}`, "error");
    } finally {
      setIsSweeping(false);
    }
  }

  // Keep the draft in sync once the real value loads, without
  // clobbering it while the admin is actively typing a new value —
  // same pattern as RoomStatusSection's cleaningHoursDraft.
  if (!isLoading && pendingHoldHoursDraft === undefined) {
    setPendingHoldHoursDraft(pendingHoldHours);
  }

  async function handleSavePendingHoldHours() {
    const nextValue = Number(pendingHoldHoursDraft);

    if (!Number.isFinite(nextValue) || !Number.isInteger(nextValue) || nextValue < 1 || nextValue > 720) {
      showToast("✕ DP Countdown must be a whole number between 1 and 720 hours.", "error");
      setPendingHoldHoursDraft(pendingHoldHours);
      return;
    }

    try {
      await updatePendingHoldHours(nextValue);
      showToast(
        `✓ DP Countdown updated to ${nextValue} hour(s). Bookings already pending keep their original countdown.`,
        "success"
      );
    } catch (submitError) {
      const message = submitError?.response?.data?.message || "Failed to update the DP Countdown.";
      showToast(`✕ ${message}`, "error");
      setPendingHoldHoursDraft(pendingHoldHours);
    }
  }

  return (
    <section className="bookingRulesSection">
      <div className="bookingRulesSectionHeaderRow">
        <div>
          <h2 className="bookingRulesSectionTitle">Section 7: DP Countdown</h2>
          <p className="bookingRulesSectionSubtitle">
            How many hours a new booking holds its dates before it&apos;s auto-expired if the guest never sends
            their DP. Changing this only affects bookings made from now on — any booking that&apos;s already
            pending keeps counting down against its own original window, so this can never be saved into an
            error because of an active pending booking.
          </p>
        </div>
        <div className="roomStatusCleaningHoursField">
          <label htmlFor="pendingHoldHoursInput">DP Countdown (Hours, Resort-Wide)</label>
          <input
            id="pendingHoldHoursInput"
            type="number"
            min="1"
            max="720"
            value={pendingHoldHoursDraft ?? pendingHoldHours}
            onChange={(event) => setPendingHoldHoursDraft(event.target.value)}
            onBlur={handleSavePendingHoldHours}
          />
        </div>
      </div>

      {isLoading && <p className="bookingRulesHint">Loading DP Countdown…</p>}
      {!isLoading && error && <p className="bookingRulesFormError">{error}</p>}

      <div className="bookingRulesSweepRow">
        <div>
          <p className="bookingRulesHint">
            In production this runs automatically every 15 minutes. On localhost, nothing triggers it on its
            own — use this button to test auto-expiry and the auto-cancellation email right now.
          </p>
        </div>
        <button
          type="button"
          className="bookingRulesButton bookingRulesButton--neutral"
          onClick={handleRunExpirySweepNow}
          disabled={isSweeping}
        >
          {isSweeping ? "Running…" : "Run Expiry Sweep Now"}
        </button>
      </div>
    </section>
  );
}
