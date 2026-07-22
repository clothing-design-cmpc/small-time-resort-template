/**
 * FILE: app/superAdmin/(protected)/settings/booking-rules/BookingRuleForm.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Create/Edit form for a single named Booking Rule set (blueprint Page
 * 7, Sections 1-5). Shared by the "new" and "[ruleId]" routes —
 * `existingRule` is null for create mode. Replaces the old
 * BookingRulesClient, which only ever edited one locked settings row —
 * super-admin can now create as many rule sets as needed and this form
 * is reused for every one of them.
 *
 * DATA FLOW:
 * 1. React Hook Form + Zod validate the fields on submit (Rule 31.7)
 * 2. POST (create) or PUT (edit) to
 *    /api/superAdmin/settings/booking-rules — on success, show a toast
 *    and redirect back to the list. This form never touches isActive —
 *    activating a rule set is a separate action from the list page.
 */
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import axios from "axios";
import { useToast } from "@/app/superAdmin/shared/useToast";
import ToastStack from "@/app/superAdmin/shared/ToastStack";
import RuleDatesCalendar from "./RuleDatesCalendar";
import "./BookingRules.css";

/* z.coerce.number() on every numeric field is what actually makes this
   form work — native number inputs hand React Hook Form a string, and
   without coercion that string gets PUT straight to Prisma's Int
   columns, which throws. */
const bookingRuleSchema = z.object({
  name: z.string().min(1, "Give this rule set a name, e.g. \"Regular Season\"."),
  ruleDates: z.array(z.string()).min(1, "Pumili ng kahit isang petsa para sa rule na ito."),
  checkInTime: z.string().min(1),
  checkOutTime: z.string().min(1),
  allowOvernightStay: z.boolean(),
  allowDayTour: z.boolean(),
  allowNightTour: z.boolean(),
  dayTourStartTime: z.string().min(1),
  dayTourEndTime: z.string().min(1),
  dayTourPricePerGuest: z.coerce.number().min(0),
  nightTourStartTime: z.string().min(1),
  nightTourEndTime: z.string().min(1),
  nightTourPricePerGuest: z.coerce.number().min(0),
  hourlyChargeAmount: z.coerce.number().min(0),
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

/* Mirrors the @default() values on the BookingRule Prisma model.
   "Reset to Default" restores these into the form (except name, which
   the admin already typed) — nothing is saved to the DB until the
   admin clicks "Save". */
const DEFAULT_BOOKING_RULE_VALUES = {
  ruleDates: [],
  checkInTime: "14:00",
  checkOutTime: "11:00",
  allowOvernightStay: true,
  allowDayTour: false,
  allowNightTour: false,
  dayTourStartTime: "08:00",
  dayTourEndTime: "17:00",
  dayTourPricePerGuest: 500,
  nightTourStartTime: "18:00",
  nightTourEndTime: "23:00",
  nightTourPricePerGuest: 600,
  hourlyChargeAmount: 0,
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

export default function BookingRuleForm({ existingRule, rooms }) {
  const router = useRouter();
  const { toasts, showToast, dismissToast } = useToast();
  const isEditMode = Boolean(existingRule);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { isSubmitting, errors },
  } = useForm({
    resolver: zodResolver(bookingRuleSchema),
    defaultValues: existingRule
      ? {
          name: existingRule.name,
          ruleDates: existingRule.ruleDates ?? [],
          checkInTime: existingRule.checkInTime,
          checkOutTime: existingRule.checkOutTime,
          allowOvernightStay: existingRule.allowOvernightStay,
          allowDayTour: existingRule.allowDayTour,
          allowNightTour: existingRule.allowNightTour,
          dayTourStartTime: existingRule.dayTourStartTime,
          dayTourEndTime: existingRule.dayTourEndTime,
          dayTourPricePerGuest: existingRule.dayTourPricePerGuest,
          nightTourStartTime: existingRule.nightTourStartTime,
          nightTourEndTime: existingRule.nightTourEndTime,
          nightTourPricePerGuest: existingRule.nightTourPricePerGuest,
          hourlyChargeAmount: existingRule.hourlyChargeAmount ?? 0,
          refundPercentage: existingRule.refundPercentage,
          cancellationCutoffDays: existingRule.cancellationCutoffDays,
          depositRequired: existingRule.depositRequired,
          depositPercentage: existingRule.depositPercentage,
          weekendSurchargePercent: existingRule.weekendSurchargePercent,
          lastMinuteDiscountPercent: existingRule.lastMinuteDiscountPercent,
          groupDiscountThreshold: existingRule.groupDiscountThreshold,
          groupDiscountPercent: existingRule.groupDiscountPercent,
          seasonalPricingEnabled: existingRule.seasonalPricingEnabled,
        }
      : { name: "", ...DEFAULT_BOOKING_RULE_VALUES },
  });

  // Section 1's date-selection state — a Set of "YYYY-MM-DD" keys, kept
  // separately from react-hook-form's own state since RuleDatesCalendar
  // isn't a native input. Synced into the "ruleDates" form field via
  // setValue on every toggle so validation/submit still see it.
  const [selectedDates, setSelectedDates] = useState(
    () => new Set(existingRule?.ruleDates ?? [])
  );

  /**
   * handleToggleDate
   * Adds/removes a date from the Section 1 calendar selection. Selecting
   * a 2nd+ date forces booking type to Overnight (Customized) — Day/Night
   * Tour only make sense for a single day, so a stale selection from
   * single-date mode can't linger once the admin picks more dates.
   */
  function handleToggleDate(dateKey) {
    setSelectedDates((previousDates) => {
      const nextDates = new Set(previousDates);
      if (nextDates.has(dateKey)) {
        nextDates.delete(dateKey);
      } else {
        nextDates.add(dateKey);
      }

      const sortedDateList = Array.from(nextDates).sort();
      setValue("ruleDates", sortedDateList, { shouldValidate: true });

      if (sortedDateList.length > 1) {
        setValue("allowOvernightStay", true);
        setValue("allowDayTour", false);
        setValue("allowNightTour", false);
      }

      return nextDates;
    });
  }

  // Every field below feeds Preview Impact directly, so changing any of
  // them updates the numbers immediately — no separate "recalculate" button.
  const weekendSurchargePercent = watch("weekendSurchargePercent");
  const lastMinuteDiscountPercent = watch("lastMinuteDiscountPercent");
  const groupDiscountThreshold = watch("groupDiscountThreshold");
  const groupDiscountPercent = watch("groupDiscountPercent");
  const depositPercentage = watch("depositPercentage");
  const depositRequired = watch("depositRequired");
  const allowOvernightStay = watch("allowOvernightStay");
  const allowDayTour = watch("allowDayTour");
  const allowNightTour = watch("allowNightTour");

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
      if (isEditMode) {
        await axios.put(`/api/superAdmin/settings/booking-rules/${existingRule.id}`, data);
        showToast("✓ Booking rule set saved successfully.", "success");
      } else {
        await axios.post("/api/superAdmin/settings/booking-rules", data);
        showToast(`✓ Booking rule set "${data.name}" created successfully.`, "success");
      }
      router.push("/superAdmin/settings/booking-rules");
    } catch (submitError) {
      const message = submitError?.response?.data?.message || "We couldn't save this rule set. Please try again.";
      showToast(`✕ ${message}`, "error");
    }
  }

  function handleResetToDefault() {
    reset({ name: watch("name"), ...DEFAULT_BOOKING_RULE_VALUES });
    setSelectedDates(new Set());
    showToast("Form reset to default values — click “Save” to apply.", "warning");
  }

  return (
    <section className="bookingRulesPage">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <div className="bookingRulesHeaderRow">
        <span className="bookingRulesEyebrow">Settings</span>
        <h1 className="bookingRulesPageTitle">{isEditMode ? "Edit Booking Rule Set" : "Create Booking Rule Set"}</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="bookingRulesForm bookingRulesForm--card">
        {/* --- Rule Set Name --- */}
        <div className="bookingRulesSection">
          <h2 className="bookingRulesSectionTitle">Rule Set Name</h2>
          <p className="bookingRulesSectionSubtitle">Ginagamit lang ito para makilala mo ang set na ito sa listahan — e.g. &quot;Regular Season&quot;, &quot;Holiday Rules&quot;.</p>
          <div className="bookingRulesFormField">
            <label htmlFor="ruleName">Name <span aria-hidden="true">*</span></label>
            <input id="ruleName" type="text" autoFocus {...register("name")} />
            {errors.name && <span role="alert" className="bookingRulesFormError">{errors.name.message}</span>}
          </div>
        </div>

        {/* --- Section 1: Rule Schedule ---
             Calendar-driven — the admin picks date(s) first, and the
             fields below change shape based on how many are selected:
               1 date   -> Rule 1: choose Overnight/Day Tour/Night Tour
               2+ dates -> Rule 2: Overnight (Customized) + Hourly Charge
             minNightsRequired/maxNightsAllowed/advanceBookingDays were
             removed from this form per admin request — no longer
             editable here, but remain in the DB at their defaults so
             existing booking validation is unaffected. */}
        <div className="bookingRulesSection">
          <h2 className="bookingRulesSectionTitle">Section 1: Rule Schedule</h2>
          <p className="bookingRulesSectionSubtitle">Piliin ang petsa (o mga petsa) na sasakupin ng rule na ito, tapos punan ang mga detalye.</p>

          <RuleDatesCalendar selectedDates={selectedDates} onToggleDate={handleToggleDate} />
          {errors.ruleDates && <span role="alert" className="bookingRulesFormError">{errors.ruleDates.message}</span>}

          {/* --- Rule 1: exactly one date selected --- */}
          {selectedDates.size === 1 && (
            <div className="bookingRulesSubPanel">
              <p className="bookingRulesSubPanelTitle">Uri ng Booking</p>
              <div className="bookingRulesToggleRow">
                <label className="bookingRulesToggle">
                  <input
                    type="radio"
                    name="singleDateBookingType"
                    checked={allowOvernightStay && !allowDayTour && !allowNightTour}
                    onChange={() => {
                      setValue("allowOvernightStay", true);
                      setValue("allowDayTour", false);
                      setValue("allowNightTour", false);
                    }}
                  />
                  Overnight Stay (tulugan, may room)
                </label>
                <label className="bookingRulesToggle">
                  <input
                    type="radio"
                    name="singleDateBookingType"
                    checked={allowDayTour}
                    onChange={() => {
                      setValue("allowOvernightStay", false);
                      setValue("allowDayTour", true);
                      setValue("allowNightTour", false);
                    }}
                  />
                  Day Tour (araw lang, walang room)
                </label>
                <label className="bookingRulesToggle">
                  <input
                    type="radio"
                    name="singleDateBookingType"
                    checked={allowNightTour}
                    onChange={() => {
                      setValue("allowOvernightStay", false);
                      setValue("allowDayTour", false);
                      setValue("allowNightTour", true);
                    }}
                  />
                  Night Tour (gabi lang, walang room)
                </label>
              </div>

              {allowOvernightStay && !allowDayTour && !allowNightTour && (
                <div className="bookingRulesFormRow">
                  <div className="bookingRulesFormField">
                    <label htmlFor="checkInTimeSingle">Check-in Date &amp; Time</label>
                    <input id="checkInTimeSingle" type="time" {...register("checkInTime")} />
                    <p className="bookingRulesHint">Petsa: {Array.from(selectedDates)[0]}</p>
                  </div>
                  <div className="bookingRulesFormField">
                    <label htmlFor="checkOutTimeSingle">Check-out Date &amp; Time</label>
                    <input id="checkOutTimeSingle" type="time" {...register("checkOutTime")} />
                  </div>
                </div>
              )}

              {allowDayTour && (
                <div className="bookingRulesFormRow">
                  <div className="bookingRulesFormField">
                    <label htmlFor="dayTourStartTime">Check-in Date &amp; Time</label>
                    <input id="dayTourStartTime" type="time" {...register("dayTourStartTime")} />
                    <p className="bookingRulesHint">Petsa: {Array.from(selectedDates)[0]}</p>
                  </div>
                  <div className="bookingRulesFormField">
                    <label htmlFor="dayTourEndTime">Check-out Date &amp; Time</label>
                    <input id="dayTourEndTime" type="time" {...register("dayTourEndTime")} />
                  </div>
                  <div className="bookingRulesFormField">
                    <label htmlFor="dayTourPricePerGuest">Bayad Kada Guest (₱)</label>
                    <input id="dayTourPricePerGuest" type="number" step="0.01" {...register("dayTourPricePerGuest")} />
                    {errors.dayTourPricePerGuest && <span role="alert" className="bookingRulesFormError">{errors.dayTourPricePerGuest.message}</span>}
                  </div>
                </div>
              )}

              {allowNightTour && (
                <div className="bookingRulesFormRow">
                  <div className="bookingRulesFormField">
                    <label htmlFor="nightTourStartTime">Check-in Date &amp; Time</label>
                    <input id="nightTourStartTime" type="time" {...register("nightTourStartTime")} />
                    <p className="bookingRulesHint">Petsa: {Array.from(selectedDates)[0]}</p>
                  </div>
                  <div className="bookingRulesFormField">
                    <label htmlFor="nightTourEndTime">Check-out Date &amp; Time</label>
                    <input id="nightTourEndTime" type="time" {...register("nightTourEndTime")} />
                  </div>
                  <div className="bookingRulesFormField">
                    <label htmlFor="nightTourPricePerGuest">Bayad Kada Guest (₱)</label>
                    <input id="nightTourPricePerGuest" type="number" step="0.01" {...register("nightTourPricePerGuest")} />
                    {errors.nightTourPricePerGuest && <span role="alert" className="bookingRulesFormError">{errors.nightTourPricePerGuest.message}</span>}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* --- Rule 2: two or more dates selected --- */}
          {selectedDates.size > 1 && (
            <div className="bookingRulesSubPanel">
              <p className="bookingRulesSubPanelTitle">Overnight (Customized)</p>
              <p className="bookingRulesHint">
                {selectedDates.size} na petsa ang napili — overnight lagi ang type kapag maraming petsa, may sariling
                check-in/check-out at dagdag na hourly charge sa ibabaw ng normal na per-night rate.
              </p>
              <div className="bookingRulesFormRow">
                <div className="bookingRulesFormField">
                  <label htmlFor="checkInTimeMulti">Check-in Date &amp; Time</label>
                  <input id="checkInTimeMulti" type="time" {...register("checkInTime")} />
                </div>
                <div className="bookingRulesFormField">
                  <label htmlFor="checkOutTimeMulti">Check-out Date &amp; Time</label>
                  <input id="checkOutTimeMulti" type="time" {...register("checkOutTime")} />
                </div>
                <div className="bookingRulesFormField">
                  <label htmlFor="hourlyChargeAmount">Hourly Charge (₱)</label>
                  <input id="hourlyChargeAmount" type="number" step="0.01" min="0" {...register("hourlyChargeAmount")} />
                  <p className="bookingRulesHint">Dagdag na bayad kada oras, sa ibabaw ng normal na per-night rate.</p>
                  {errors.hourlyChargeAmount && <span role="alert" className="bookingRulesFormError">{errors.hourlyChargeAmount.message}</span>}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* --- Section 2: Cancellation Policy --- */}
        <div className="bookingRulesSection">
          <h2 className="bookingRulesSectionTitle">Section 2: Cancellation Policy</h2>
          <p className="bookingRulesSectionSubtitle">Kung mag-cancel ang guest, gaano karami ang maibabalik sa kanila, at hanggang kailan puwede mag-cancel para may refund pa.</p>
          <div className="bookingRulesFormRow">
            <div className="bookingRulesFormField">
              <label htmlFor="refundPercentage">Ibabalik na Bayad Kapag Nag-cancel (%)</label>
              <input id="refundPercentage" type="number" min="0" max="100" {...register("refundPercentage")} />
              <p className="bookingRulesHint">Halimbawa: 100% = ibabalik lahat ng bayad. 50% = kalahati lang ang maibabalik.</p>
              {errors.refundPercentage && <span role="alert" className="bookingRulesFormError">{errors.refundPercentage.message}</span>}
            </div>
            <div className="bookingRulesFormField">
              <label htmlFor="cancellationCutoffDays">Dapat Mag-cancel Bago ang Ilang Araw</label>
              <input id="cancellationCutoffDays" type="number" {...register("cancellationCutoffDays")} />
              <p className="bookingRulesHint">Halimbawa: 7 = dapat mag-cancel ang guest 7 araw o mas maaga bago ang check-in para makakuha ng refund sa taas.</p>
              {errors.cancellationCutoffDays && <span role="alert" className="bookingRulesFormError">{errors.cancellationCutoffDays.message}</span>}
            </div>
          </div>
          <p className="bookingRulesHint">
            Ibig sabihin: &quot;Full refund kung mag-cancel ng {watch("cancellationCutoffDays")}+ araw bago ang check-in.&quot;
          </p>
        </div>

        {/* --- Section 3: Deposit & Payment --- */}
        <div className="bookingRulesSection">
          <h2 className="bookingRulesSectionTitle">Section 3: Deposit &amp; Payment</h2>
          <p className="bookingRulesSectionSubtitle">Kailangan bang magbayad muna ang guest para ma-confirm ang booking, at magkano.</p>
          <label className="bookingRulesToggle">
            <input type="checkbox" {...register("depositRequired")} />
            Kailangan ng deposito para ma-confirm ang booking
          </label>
          <div className="bookingRulesFormField">
            <label htmlFor="depositPercentage">Halaga ng Deposito (%)</label>
            <input id="depositPercentage" type="number" min="0" max="100" {...register("depositPercentage")} />
            <p className="bookingRulesHint">Halimbawa: &quot;{depositPercentage || 0}% ng kabuuang bayad ang kukunin bilang deposito.&quot;</p>
            {errors.depositPercentage && <span role="alert" className="bookingRulesFormError">{errors.depositPercentage.message}</span>}
          </div>
        </div>

        {/* --- Section 4: Pricing Modifiers --- */}
        <div className="bookingRulesSection">
          <h2 className="bookingRulesSectionTitle">Section 4: Pricing Modifiers</h2>
          <p className="bookingRulesSectionSubtitle">Automatic na dagdag o bawas sa presyo, sa ibabaw ng regular rate ng room.</p>
          <div className="bookingRulesFormRow">
            <div className="bookingRulesFormField">
              <label htmlFor="weekendSurchargePercent">Dagdag Bayad tuwing Biyernes/Sabado ng Gabi (%)</label>
              <input id="weekendSurchargePercent" type="number" {...register("weekendSurchargePercent")} />
              <p className="bookingRulesHint">Halimbawa: &quot;{weekendSurchargePercent || 0}% dagdag sa Fri/Sat nights.&quot;</p>
              {errors.weekendSurchargePercent && <span role="alert" className="bookingRulesFormError">{errors.weekendSurchargePercent.message}</span>}
            </div>
            <div className="bookingRulesFormField">
              <label htmlFor="lastMinuteDiscountPercent">Discount Kapag Last-Minute na ang Book (%)</label>
              <input id="lastMinuteDiscountPercent" type="number" {...register("lastMinuteDiscountPercent")} />
              <p className="bookingRulesHint">Halimbawa: &quot;{lastMinuteDiscountPercent || 0}% off kapag malapit na ang check-in date sa oras ng pag-book.&quot;</p>
              {errors.lastMinuteDiscountPercent && <span role="alert" className="bookingRulesFormError">{errors.lastMinuteDiscountPercent.message}</span>}
            </div>
          </div>
          <div className="bookingRulesFormRow">
            <div className="bookingRulesFormField">
              <label htmlFor="groupDiscountThreshold">Ilang Room Bago Mag-apply ang Group Discount</label>
              <input id="groupDiscountThreshold" type="number" {...register("groupDiscountThreshold")} />
              <p className="bookingRulesHint">Halimbawa: 3 = kailangang 3 rooms o higit pa sa iisang booking bago mag-apply ang discount sa baba.</p>
              {errors.groupDiscountThreshold && <span role="alert" className="bookingRulesFormError">{errors.groupDiscountThreshold.message}</span>}
            </div>
            <div className="bookingRulesFormField">
              <label htmlFor="groupDiscountPercent">Group Discount (%)</label>
              <input id="groupDiscountPercent" type="number" {...register("groupDiscountPercent")} />
              <p className="bookingRulesHint">Halimbawa: &quot;{watch("groupDiscountThreshold") || 0}+ rooms = {watch("groupDiscountPercent") || 0}% off.&quot;</p>
              {errors.groupDiscountPercent && <span role="alert" className="bookingRulesFormError">{errors.groupDiscountPercent.message}</span>}
            </div>
          </div>
        </div>

        {/* --- Section 5: Seasonal Pricing (enable toggle only — the actual
             season list is managed on the list page, per-room) --- */}
        <div className="bookingRulesSection">
          <h2 className="bookingRulesSectionTitle">Section 5: Seasonal Pricing</h2>
          <p className="bookingRulesSectionSubtitle">I-on o i-off ang special pricing para sa mga piling petsa (hal. Peak Season, Off-Season) habang active ang rule set na ito.</p>
          <label className="bookingRulesToggle">
            <input type="checkbox" {...register("seasonalPricingEnabled")} />
            I-enable ang seasonal pricing
          </label>
          <p className="bookingRulesHint">Kapag naka-off ito, hindi gagamitin ang mga seasonal price sa baba — regular rate lagi ang gagamitin ng bawat room.</p>
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
          <button type="button" className="bookingRulesButton bookingRulesButton--neutral" onClick={() => router.push("/superAdmin/settings/booking-rules")}>
            Cancel
          </button>
          <button type="button" className="bookingRulesButton bookingRulesButton--neutral" onClick={handleResetToDefault}>
            Reset to Default
          </button>
          <button type="submit" className="bookingRulesButton bookingRulesButton--primary" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : isEditMode ? "Save Changes" : "Create Rule Set"}
          </button>
        </div>
      </form>
    </section>
  );
}