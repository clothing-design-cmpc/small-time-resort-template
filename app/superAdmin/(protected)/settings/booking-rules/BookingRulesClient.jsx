/**
 * FILE: app/superAdmin/(protected)/settings/booking-rules/BookingRulesClient.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Booking Rules & Configuration (blueprint Page 7). Renders Sections
 * 1-4 as a single settings form (general rules, booking types,
 * cancellation, deposit, pricing modifiers, seasonal pricing toggle),
 * a live Preview Impact calculation, Save All / Reset to Default
 * actions, and the Seasonal Pricing / Blackout Dates sub-sections.
 *
 * DATA FLOW:
 * 1. useBookingRules() fetches the singleton settings row on mount
 * 2. React Hook Form is reset with the fetched values once loaded, so
 *    the form always reflects what's actually in the DB
 * 3. watch() feeds the Preview Impact panel so it recalculates live
 *    as the admin edits deposit %, surcharge %, etc.
 * 4. On submit, saveBookingRules() PUTs the full payload; "Reset to
 *    Default" re-fetches and re-populates from the DB (not schema
 *    defaults — it un-does unsaved edits, matching Rule 25's
 *    loading/error/empty discipline rather than silently wiping data)
 */
"use client";

import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { useBookingRules } from "@/hooks/useBookingRules";
import { useToast } from "@/app/superAdmin/shared/useToast";
import ToastStack from "@/app/superAdmin/shared/ToastStack";
import SeasonalPricingSection from "./SeasonalPricingSection";
import BlackoutDatesSection from "./BlackoutDatesSection";

/* Mirrors the @default() values on the BookingRules Prisma model.
   "Reset to Default" restores these into the form only — nothing is
   saved to the DB until the admin clicks "Save All Changes". */
const DEFAULT_BOOKING_RULES = {
  minNightsRequired: 1,
  maxNightsAllowed: 30,
  advanceBookingDays: 365,
  checkInTime: "14:00",
  checkOutTime: "11:00",
  allowOvernightStay: true,
  allowDayTour: false,
  allowNightTour: false,
  refundPercentage: 100,
  cancellationCutoffDays: 7,
  depositRequired: true,
  depositPercentage: 50,
  weekendSurchargePercent: 0,
  lastMinuteDiscountPercent: 0,
  groupDiscountThreshold: 3,
  groupDiscountPercent: 0,
  seasonalPricingEnabled: true,
};

export default function BookingRulesClient({ rooms }) {
  const { bookingRules, isLoading, error, saveBookingRules } = useBookingRules();
  const { toasts, showToast, dismissToast } = useToast();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { isSubmitting },
  } = useForm({
    defaultValues: DEFAULT_BOOKING_RULES,
  });

  // Once the singleton row loads from the API, populate the form with
  // the real saved values — the defaultValues above only cover the
  // brief moment before the fetch resolves.
  useEffect(() => {
    if (bookingRules) {
      reset({
        minNightsRequired: bookingRules.minNightsRequired,
        maxNightsAllowed: bookingRules.maxNightsAllowed,
        advanceBookingDays: bookingRules.advanceBookingDays,
        checkInTime: bookingRules.checkInTime,
        checkOutTime: bookingRules.checkOutTime,
        allowOvernightStay: bookingRules.allowOvernightStay,
        allowDayTour: bookingRules.allowDayTour,
        allowNightTour: bookingRules.allowNightTour,
        refundPercentage: bookingRules.refundPercentage,
        cancellationCutoffDays: bookingRules.cancellationCutoffDays,
        depositRequired: bookingRules.depositRequired,
        depositPercentage: bookingRules.depositPercentage,
        weekendSurchargePercent: bookingRules.weekendSurchargePercent,
        lastMinuteDiscountPercent: bookingRules.lastMinuteDiscountPercent,
        groupDiscountThreshold: bookingRules.groupDiscountThreshold,
        groupDiscountPercent: bookingRules.groupDiscountPercent,
        seasonalPricingEnabled: bookingRules.seasonalPricingEnabled,
      });
    }
  }, [bookingRules, reset]);

  const weekendSurchargePercent = watch("weekendSurchargePercent");
  const depositPercentage = watch("depositPercentage");
  const depositRequired = watch("depositRequired");

  // Sample scenario per the blueprint spec: 5 weekday nights on the
  // first room in the list, so no weekend surcharge applies — this
  // recalculates live as the admin edits deposit % or surcharge %.
  const previewImpact = useMemo(() => {
    const sampleRoom = rooms[0];
    if (!sampleRoom) return null;

    const nights = 5;
    const subtotal = sampleRoom.pricePerNight * nights;
    const weekendSurcharge = 0; // sample stay is Mon-Fri, matching the blueprint's example
    const deposit = depositRequired ? subtotal * ((Number(depositPercentage) || 0) / 100) : 0;
    const totalDue = depositRequired ? deposit : subtotal;

    return { sampleRoom, nights, subtotal, weekendSurcharge, deposit, totalDue };
  }, [rooms, depositPercentage, depositRequired]);

  async function onSubmit(data) {
    try {
      await saveBookingRules(data);
      showToast("✓ Booking rules saved successfully.", "success");
    } catch (submitError) {
      const message = submitError?.response?.data?.message || "We couldn't save the booking rules. Please try again.";
      showToast(`✕ ${message}`, "error");
    }
  }

  async function handleResetToDefault() {
    reset(DEFAULT_BOOKING_RULES);
    showToast("Form reset to default values — click “Save All Changes” to apply.", "warning");
  }

  return (
    <section className="bookingRulesPage">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <div className="bookingRulesHeaderRow">
        <span className="bookingRulesEyebrow">Settings</span>
        <h1 className="bookingRulesPageTitle">Booking Rules &amp; Configuration</h1>
      </div>

      {error && (
        <p className="bookingRulesHint" role="alert">
          We couldn&apos;t load the current settings. Showing defaults — saving will overwrite them.
        </p>
      )}

      {!isLoading && (
        <form onSubmit={handleSubmit(onSubmit)} className="bookingRulesForm bookingRulesForm--card">
          {/* --- Section 1: General Booking Settings --- */}
          <div className="bookingRulesSection">
            <h2 className="bookingRulesSectionTitle">Section 1: General Booking Settings</h2>

            <div className="bookingRulesFormRow">
              <div className="bookingRulesFormField">
                <label htmlFor="minNightsRequired">Minimum Nights Required</label>
                <input id="minNightsRequired" type="number" {...register("minNightsRequired")} />
                <p className="bookingRulesHint">Resort-wide default — a room can override this with its own Min Nights / Booking value.</p>
              </div>
              <div className="bookingRulesFormField">
                <label htmlFor="maxNightsAllowed">Maximum Nights Allowed</label>
                <input id="maxNightsAllowed" type="number" {...register("maxNightsAllowed")} />
                <p className="bookingRulesHint">Resort-wide default — a room can override this with its own Max Nights / Booking value.</p>
              </div>
            </div>

            <div className="bookingRulesFormRow">
              <div className="bookingRulesFormField">
                <label htmlFor="advanceBookingDays">Advance Booking Window (days)</label>
                <input id="advanceBookingDays" type="number" {...register("advanceBookingDays")} />
                <p className="bookingRulesHint">How far ahead guests are allowed to book, e.g. 365 = up to a year out.</p>
              </div>
              <div className="bookingRulesFormField">
                <label htmlFor="checkInTime">Check-in Time</label>
                <input id="checkInTime" type="time" {...register("checkInTime")} />
              </div>
              <div className="bookingRulesFormField">
                <label htmlFor="checkOutTime">Check-out Time</label>
                <input id="checkOutTime" type="time" {...register("checkOutTime")} />
              </div>
            </div>

            <div className="bookingRulesFormField">
              <label>Booking Types</label>
              <p className="bookingRulesHint">Which kinds of reservations guests can make. Overnight is the standard stay; Day/Night Tour are shorter, no-overnight visits.</p>
              <div className="bookingRulesToggleRow">
                <label className="bookingRulesToggle">
                  <input type="checkbox" {...register("allowOvernightStay")} />
                  Overnight Stay
                </label>
                <label className="bookingRulesToggle">
                  <input type="checkbox" {...register("allowDayTour")} />
                  Day Tour
                </label>
                <label className="bookingRulesToggle">
                  <input type="checkbox" {...register("allowNightTour")} />
                  Night Tour
                </label>
              </div>
            </div>
          </div>

          {/* --- Section 2: Cancellation Policy --- */}
          <div className="bookingRulesSection">
            <h2 className="bookingRulesSectionTitle">Section 2: Cancellation Policy</h2>
            <div className="bookingRulesFormRow">
              <div className="bookingRulesFormField">
                <label htmlFor="refundPercentage">Refund Percentage (%)</label>
                <input id="refundPercentage" type="number" min="0" max="100" {...register("refundPercentage")} />
              </div>
              <div className="bookingRulesFormField">
                <label htmlFor="cancellationCutoffDays">Cancellation Cutoff (days before check-in)</label>
                <input id="cancellationCutoffDays" type="number" {...register("cancellationCutoffDays")} />
              </div>
            </div>
            <p className="bookingRulesHint">
              Example: &quot;Full refund if cancelled {watch("cancellationCutoffDays")}+ days before check-in.&quot;
            </p>
          </div>

          {/* --- Section 3: Deposit & Payment --- */}
          <div className="bookingRulesSection">
            <h2 className="bookingRulesSectionTitle">Section 3: Deposit &amp; Payment</h2>
            <label className="bookingRulesToggle">
              <input type="checkbox" {...register("depositRequired")} />
              Deposit required to confirm a booking
            </label>
            <div className="bookingRulesFormField">
              <label htmlFor="depositPercentage">Deposit Percentage (%)</label>
              <input id="depositPercentage" type="number" min="0" max="100" {...register("depositPercentage")} />
              <p className="bookingRulesHint">Example: &quot;{depositPercentage || 0}% of total room price held as deposit.&quot;</p>
            </div>
          </div>

          {/* --- Section 4: Pricing Modifiers --- */}
          <div className="bookingRulesSection">
            <h2 className="bookingRulesSectionTitle">Section 4: Pricing Modifiers</h2>
            <div className="bookingRulesFormRow">
              <div className="bookingRulesFormField">
                <label htmlFor="weekendSurchargePercent">Weekend Surcharge (%)</label>
                <input id="weekendSurchargePercent" type="number" {...register("weekendSurchargePercent")} />
                <p className="bookingRulesHint">Example: &quot;{weekendSurchargePercent || 0}% extra on Fri/Sat nights.&quot;</p>
              </div>
              <div className="bookingRulesFormField">
                <label htmlFor="lastMinuteDiscountPercent">Last-Minute Discount (%)</label>
                <input id="lastMinuteDiscountPercent" type="number" {...register("lastMinuteDiscountPercent")} />
                <p className="bookingRulesHint">Example: &quot;15% off bookings made within 3 days.&quot;</p>
              </div>
            </div>
            <div className="bookingRulesFormRow">
              <div className="bookingRulesFormField">
                <label htmlFor="groupDiscountThreshold">Group Discount Threshold (rooms)</label>
                <input id="groupDiscountThreshold" type="number" {...register("groupDiscountThreshold")} />
              </div>
              <div className="bookingRulesFormField">
                <label htmlFor="groupDiscountPercent">Group Discount (%)</label>
                <input id="groupDiscountPercent" type="number" {...register("groupDiscountPercent")} />
                <p className="bookingRulesHint">Example: &quot;{watch("groupDiscountThreshold") || 0}+ rooms = {watch("groupDiscountPercent") || 0}% off.&quot;</p>
              </div>
            </div>
          </div>

          {/* --- Section 5: Seasonal Pricing (enable toggle only — the actual
               season list is its own component below the form) --- */}
          <div className="bookingRulesSection">
            <h2 className="bookingRulesSectionTitle">Section 5: Seasonal Pricing</h2>
            <label className="bookingRulesToggle">
              <input type="checkbox" {...register("seasonalPricingEnabled")} />
              Enable seasonal pricing overrides
            </label>
            <p className="bookingRulesHint">When off, all seasonal price entries below are ignored and rooms always charge their default rate.</p>
          </div>

          {/* --- Preview Impact --- */}
          {previewImpact && (
            <div className="bookingRulesSection bookingRulesPreview">
              <h2 className="bookingRulesSectionTitle">Preview Impact</h2>
              <p className="bookingRulesHint">
                If a guest books {previewImpact.sampleRoom.name} for {previewImpact.nights} nights (Mon–Fri) next month:
              </p>
              <dl className="bookingRulesPreviewList">
                <div className="bookingRulesPreviewRow">
                  <dt>Base price</dt>
                  <dd>₱{previewImpact.sampleRoom.pricePerNight.toLocaleString()}/night</dd>
                </div>
                <div className="bookingRulesPreviewRow">
                  <dt>Subtotal ({previewImpact.nights} nights)</dt>
                  <dd>₱{previewImpact.subtotal.toLocaleString()}</dd>
                </div>
                <div className="bookingRulesPreviewRow">
                  <dt>Weekend surcharge</dt>
                  <dd>₱{previewImpact.weekendSurcharge.toLocaleString()} (weekday only)</dd>
                </div>
                <div className="bookingRulesPreviewRow">
                  <dt>Deposit ({depositRequired ? `${depositPercentage || 0}%` : "not required"})</dt>
                  <dd>₱{previewImpact.deposit.toLocaleString()}</dd>
                </div>
                <div className="bookingRulesPreviewRow bookingRulesPreviewRow--total">
                  <dt>Total due now</dt>
                  <dd>₱{previewImpact.totalDue.toLocaleString()}</dd>
                </div>
              </dl>
            </div>
          )}

          <div className="bookingRulesFormActions">
            <button type="button" className="bookingRulesButton bookingRulesButton--neutral" onClick={handleResetToDefault}>
              Reset to Default
            </button>
            <button type="submit" className="bookingRulesButton bookingRulesButton--primary" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Save All Changes"}
            </button>
          </div>
        </form>
      )}

      <SeasonalPricingSection rooms={rooms} showToast={showToast} />
      <BlackoutDatesSection rooms={rooms} showToast={showToast} />
    </section>
  );
}
