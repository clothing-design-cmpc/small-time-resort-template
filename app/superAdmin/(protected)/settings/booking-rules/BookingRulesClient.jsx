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
 * 2. React Hook Form (with a Zod resolver — every numeric field is
 *    coerced from the input's string value to a number, or the API
 *    would receive strings and Prisma would reject them) is reset with
 *    the fetched values once loaded, so the form always reflects
 *    what's actually in the DB
 * 3. watch() feeds the Preview Impact panel so it recalculates live as
 *    the admin edits any pricing/deposit/discount field; two local
 *    "simulate" toggles let the admin see the conditional discounts
 *    (last-minute, group) applied without those toggles being saved
 * 4. On submit, saveBookingRules() PUTs the full payload; "Reset to
 *    Default" resets the in-memory form to the schema's default
 *    values only — nothing is written to the DB until Save is clicked
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useBookingRules } from "@/hooks/useBookingRules";
import { useToast } from "@/app/superAdmin/shared/useToast";
import ToastStack from "@/app/superAdmin/shared/ToastStack";
import SeasonalPricingSection from "./SeasonalPricingSection";
import BlackoutDatesSection from "./BlackoutDatesSection";

/* z.coerce.number() on every numeric field is what actually makes this
   form work — native number inputs hand React Hook Form a string, and
   without coercion that string gets PUT straight to Prisma's Int
   columns, which throws. This was silently broken before (Task 2 fix). */
const bookingRulesSchema = z.object({
  minNightsRequired: z.coerce.number().int().min(1),
  maxNightsAllowed: z.coerce.number().int().min(1),
  advanceBookingDays: z.coerce.number().int().min(0),
  checkInTime: z.string().min(1),
  checkOutTime: z.string().min(1),
  allowOvernightStay: z.boolean(),
  allowDayTour: z.boolean(),
  allowNightTour: z.boolean(),
  refundPercentage: z.coerce.number().int().min(0).max(100),
  cancellationCutoffDays: z.coerce.number().int().min(0),
  depositRequired: z.boolean(),
  depositPercentage: z.coerce.number().int().min(0).max(100),
  weekendSurchargePercent: z.coerce.number().int().min(0),
  lastMinuteDiscountPercent: z.coerce.number().int().min(0),
  groupDiscountThreshold: z.coerce.number().int().min(1),
  groupDiscountPercent: z.coerce.number().int().min(0),
  seasonalPricingEnabled: z.boolean(),
});

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
    formState: { isSubmitting, errors },
  } = useForm({
    resolver: zodResolver(bookingRulesSchema),
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

  // Every field below feeds Preview Impact directly, so changing any of
  // them updates the numbers immediately — no separate "recalculate"
  // button (Task 1 follow-up: this used to hardcode weekend surcharge
  // to ₱0 and ignore the discount fields entirely, so it looked broken).
  const weekendSurchargePercent = watch("weekendSurchargePercent");
  const lastMinuteDiscountPercent = watch("lastMinuteDiscountPercent");
  const groupDiscountThreshold = watch("groupDiscountThreshold");
  const groupDiscountPercent = watch("groupDiscountPercent");
  const depositPercentage = watch("depositPercentage");
  const depositRequired = watch("depositRequired");

  // Local-only toggles (not saved, not part of the settings form) that
  // let the admin see the conditional discounts in action instead of
  // just trusting a number they can't preview.
  const [simulateLastMinute, setSimulateLastMinute] = useState(false);
  const [simulateGroupBooking, setSimulateGroupBooking] = useState(false);

  // Sample scenario: a 5-night stay starting on a Friday, so 2 of the
  // 5 nights (Fri, Sat) are weekend nights and the surcharge has
  // something real to apply to — a pure Mon-Fri sample can never show
  // a surcharge no matter what % is entered.
  const previewImpact = useMemo(() => {
    const sampleRoom = rooms[0];
    if (!sampleRoom) return null;

    const totalNights = 5;
    const weekendNights = 2;
    const weekdayNights = totalNights - weekendNights;

    const weekdaySubtotal = sampleRoom.pricePerNight * weekdayNights;
    const weekendBaseSubtotal = sampleRoom.pricePerNight * weekendNights;
    const weekendSurcharge = weekendBaseSubtotal * ((Number(weekendSurchargePercent) || 0) / 100);
    const subtotal = weekdaySubtotal + weekendBaseSubtotal + weekendSurcharge;

    const lastMinuteDiscount = simulateLastMinute
      ? subtotal * ((Number(lastMinuteDiscountPercent) || 0) / 100)
      : 0;
    const meetsGroupThreshold = simulateGroupBooking; // sample assumes the admin is testing a qualifying group
    const groupDiscount = meetsGroupThreshold ? subtotal * ((Number(groupDiscountPercent) || 0) / 100) : 0;

    const subtotalAfterDiscounts = Math.max(subtotal - lastMinuteDiscount - groupDiscount, 0);
    const deposit = depositRequired ? subtotalAfterDiscounts * ((Number(depositPercentage) || 0) / 100) : 0;
    const totalDue = depositRequired ? deposit : subtotalAfterDiscounts;

    return {
      sampleRoom,
      totalNights,
      weekendNights,
      weekdayNights,
      subtotal,
      weekendSurcharge,
      lastMinuteDiscount,
      groupDiscount,
      subtotalAfterDiscounts,
      deposit,
      totalDue,
    };
  }, [
    rooms,
    weekendSurchargePercent,
    lastMinuteDiscountPercent,
    groupDiscountPercent,
    depositPercentage,
    depositRequired,
    simulateLastMinute,
    simulateGroupBooking,
  ]);

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
            <p className="bookingRulesSectionSubtitle">The resort-wide defaults for every stay — how long, how far ahead, and what times guests check in/out.</p>

            <div className="bookingRulesFormRow">
              <div className="bookingRulesFormField">
                <label htmlFor="minNightsRequired">Minimum Nights Required</label>
                <input id="minNightsRequired" type="number" {...register("minNightsRequired")} />
                <p className="bookingRulesHint">Resort-wide default — a room can override this with its own Min Nights / Booking value.</p>
                {errors.minNightsRequired && <span role="alert" className="bookingRulesFormError">{errors.minNightsRequired.message}</span>}
              </div>
              <div className="bookingRulesFormField">
                <label htmlFor="maxNightsAllowed">Maximum Nights Allowed</label>
                <input id="maxNightsAllowed" type="number" {...register("maxNightsAllowed")} />
                <p className="bookingRulesHint">Resort-wide default — a room can override this with its own Max Nights / Booking value.</p>
                {errors.maxNightsAllowed && <span role="alert" className="bookingRulesFormError">{errors.maxNightsAllowed.message}</span>}
              </div>
            </div>

            <div className="bookingRulesFormRow">
              <div className="bookingRulesFormField">
                <label htmlFor="advanceBookingDays">Advance Booking Window (days)</label>
                <input id="advanceBookingDays" type="number" {...register("advanceBookingDays")} />
                <p className="bookingRulesHint">How far ahead guests are allowed to book, e.g. 365 = up to a year out.</p>
                {errors.advanceBookingDays && <span role="alert" className="bookingRulesFormError">{errors.advanceBookingDays.message}</span>}
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
            <p className="bookingRulesSectionSubtitle">What a guest gets back if they cancel, and how close to check-in that still applies.</p>
            <div className="bookingRulesFormRow">
              <div className="bookingRulesFormField">
                <label htmlFor="refundPercentage">Refund Percentage (%)</label>
                <input id="refundPercentage" type="number" min="0" max="100" {...register("refundPercentage")} />
                {errors.refundPercentage && <span role="alert" className="bookingRulesFormError">{errors.refundPercentage.message}</span>}
              </div>
              <div className="bookingRulesFormField">
                <label htmlFor="cancellationCutoffDays">Cancellation Cutoff (days before check-in)</label>
                <input id="cancellationCutoffDays" type="number" {...register("cancellationCutoffDays")} />
                {errors.cancellationCutoffDays && <span role="alert" className="bookingRulesFormError">{errors.cancellationCutoffDays.message}</span>}
              </div>
            </div>
            <p className="bookingRulesHint">
              Example: &quot;Full refund if cancelled {watch("cancellationCutoffDays")}+ days before check-in.&quot;
            </p>
          </div>

          {/* --- Section 3: Deposit & Payment --- */}
          <div className="bookingRulesSection">
            <h2 className="bookingRulesSectionTitle">Section 3: Deposit &amp; Payment</h2>
            <p className="bookingRulesSectionSubtitle">Whether guests need to pay upfront to lock in a booking, and how much.</p>
            <label className="bookingRulesToggle">
              <input type="checkbox" {...register("depositRequired")} />
              Deposit required to confirm a booking
            </label>
            <div className="bookingRulesFormField">
              <label htmlFor="depositPercentage">Deposit Percentage (%)</label>
              <input id="depositPercentage" type="number" min="0" max="100" {...register("depositPercentage")} />
              <p className="bookingRulesHint">Example: &quot;{depositPercentage || 0}% of total room price held as deposit.&quot;</p>
              {errors.depositPercentage && <span role="alert" className="bookingRulesFormError">{errors.depositPercentage.message}</span>}
            </div>
          </div>

          {/* --- Section 4: Pricing Modifiers --- */}
          <div className="bookingRulesSection">
            <h2 className="bookingRulesSectionTitle">Section 4: Pricing Modifiers</h2>
            <p className="bookingRulesSectionSubtitle">Automatic price add-ons and discounts applied on top of a room&apos;s base rate.</p>
            <div className="bookingRulesFormRow">
              <div className="bookingRulesFormField">
                <label htmlFor="weekendSurchargePercent">Weekend Surcharge (%)</label>
                <input id="weekendSurchargePercent" type="number" {...register("weekendSurchargePercent")} />
                <p className="bookingRulesHint">Example: &quot;{weekendSurchargePercent || 0}% extra on Fri/Sat nights.&quot;</p>
                {errors.weekendSurchargePercent && <span role="alert" className="bookingRulesFormError">{errors.weekendSurchargePercent.message}</span>}
              </div>
              <div className="bookingRulesFormField">
                <label htmlFor="lastMinuteDiscountPercent">Last-Minute Discount (%)</label>
                <input id="lastMinuteDiscountPercent" type="number" {...register("lastMinuteDiscountPercent")} />
                <p className="bookingRulesHint">Example: &quot;15% off bookings made within 3 days.&quot;</p>
                {errors.lastMinuteDiscountPercent && <span role="alert" className="bookingRulesFormError">{errors.lastMinuteDiscountPercent.message}</span>}
              </div>
            </div>
            <div className="bookingRulesFormRow">
              <div className="bookingRulesFormField">
                <label htmlFor="groupDiscountThreshold">Group Discount Threshold (rooms)</label>
                <input id="groupDiscountThreshold" type="number" {...register("groupDiscountThreshold")} />
                {errors.groupDiscountThreshold && <span role="alert" className="bookingRulesFormError">{errors.groupDiscountThreshold.message}</span>}
              </div>
              <div className="bookingRulesFormField">
                <label htmlFor="groupDiscountPercent">Group Discount (%)</label>
                <input id="groupDiscountPercent" type="number" {...register("groupDiscountPercent")} />
                <p className="bookingRulesHint">Example: &quot;{watch("groupDiscountThreshold") || 0}+ rooms = {watch("groupDiscountPercent") || 0}% off.&quot;</p>
                {errors.groupDiscountPercent && <span role="alert" className="bookingRulesFormError">{errors.groupDiscountPercent.message}</span>}
              </div>
            </div>
          </div>

          {/* --- Section 5: Seasonal Pricing (enable toggle only — the actual
               season list is its own component below the form) --- */}
          <div className="bookingRulesSection">
            <h2 className="bookingRulesSectionTitle">Section 5: Seasonal Pricing</h2>
            <p className="bookingRulesSectionSubtitle">Turn date-range price overrides (peak season, off-season, etc.) on or off resort-wide.</p>
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
              <p className="bookingRulesSectionSubtitle">
                A live example so you can see exactly what a guest would pay before you save — every number below
                updates instantly as you edit the fields above.
              </p>
              <p className="bookingRulesHint">
                Sample: {previewImpact.sampleRoom.name}, {previewImpact.totalNights} nights starting on a Friday
                ({previewImpact.weekendNights} weekend nights, {previewImpact.weekdayNights} weekday nights).
              </p>

              <div className="bookingRulesToggleRow">
                <label className="bookingRulesToggle">
                  <input
                    type="checkbox"
                    checked={simulateLastMinute}
                    onChange={(event) => setSimulateLastMinute(event.target.checked)}
                  />
                  Simulate last-minute booking
                </label>
                <label className="bookingRulesToggle">
                  <input
                    type="checkbox"
                    checked={simulateGroupBooking}
                    onChange={(event) => setSimulateGroupBooking(event.target.checked)}
                  />
                  Simulate group booking ({groupDiscountThreshold || 0}+ rooms)
                </label>
              </div>

              <dl className="bookingRulesPreviewList">
                <div className="bookingRulesPreviewRow">
                  <dt>Base price</dt>
                  <dd>₱{previewImpact.sampleRoom.pricePerNight.toLocaleString()}/night</dd>
                </div>
                <div className="bookingRulesPreviewRow">
                  <dt>Weekday nights ({previewImpact.weekdayNights})</dt>
                  <dd>₱{(previewImpact.sampleRoom.pricePerNight * previewImpact.weekdayNights).toLocaleString()}</dd>
                </div>
                <div className="bookingRulesPreviewRow">
                  <dt>Weekend nights ({previewImpact.weekendNights}) + {weekendSurchargePercent || 0}% surcharge</dt>
                  <dd>
                    ₱{(previewImpact.sampleRoom.pricePerNight * previewImpact.weekendNights + previewImpact.weekendSurcharge).toLocaleString()}
                  </dd>
                </div>
                <div className="bookingRulesPreviewRow">
                  <dt>Subtotal ({previewImpact.totalNights} nights)</dt>
                  <dd>₱{previewImpact.subtotal.toLocaleString()}</dd>
                </div>
                {simulateLastMinute && (
                  <div className="bookingRulesPreviewRow">
                    <dt>Last-minute discount ({lastMinuteDiscountPercent || 0}%)</dt>
                    <dd>−₱{previewImpact.lastMinuteDiscount.toLocaleString()}</dd>
                  </div>
                )}
                {simulateGroupBooking && (
                  <div className="bookingRulesPreviewRow">
                    <dt>Group discount ({groupDiscountPercent || 0}%)</dt>
                    <dd>−₱{previewImpact.groupDiscount.toLocaleString()}</dd>
                  </div>
                )}
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
