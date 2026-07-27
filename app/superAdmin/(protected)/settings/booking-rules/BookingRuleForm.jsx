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
import ConfirmationModal from "@/components/superAdmin/ConfirmationModal";
import RuleDatesCalendar, { getDateRangeKeys } from "./RuleDatesCalendar";
import SeasonDefinitionsPanel from "./SeasonDefinitionsPanel";
import "./BookingRules.css";

/**
 * addDaysToDate
 * Given a "YYYY-MM-DD" key, returns the date key `days` calendar days
 * later. Used both for the single-date Overnight panel (days = 1) and
 * for the multi-date panel, where the check-out date now depends on
 * how many full days the total hours-of-stay actually carries past
 * check-in (see computeMultiNightCheckout below).
 */
function addDaysToDate(dateKey, days) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const shifted = new Date(year, month - 1, day + days);
  const y = shifted.getFullYear();
  const m = String(shifted.getMonth() + 1).padStart(2, "0");
  const d = String(shifted.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * addOneDay
 * Given a "YYYY-MM-DD" key, returns the next calendar day's key. Used
 * for the Overnight (single date) booking type, where the stay's
 * check-out date is the day after the selected rule date. Kept as its
 * own named function (the days = 1 case of addDaysToDate) since it
 * reads clearer at that single-date call site.
 */
function addOneDay(dateKey) {
  return addDaysToDate(dateKey, 1);
}

/**
 * formatDisplayDate
 * Formats a "YYYY-MM-DD" key as a readable date (e.g. "July 1, 2026")
 * for the read-only Check-in/Check-out Date fields — kept separate
 * from the Time inputs so the admin sees both values at a glance
 * instead of a single ambiguous "Date & Time" field that only ever
 * held a time.
 */
function formatDisplayDate(dateKey) {
  if (!dateKey) return "—";
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * addHoursToTime
 * Given a "HH:mm" start time and a whole number of hours, returns the
 * resulting "HH:mm" end time. Wraps past midnight (e.g. 22:00 + 5h ->
 * 03:00) since Overnight Stay and Night Tour both legitimately cross
 * into the next calendar day — the check-out DATE is already handled
 * separately (addOneDay for Overnight, same-day for the two Tour
 * types), so this only ever needs to compute the clock time itself.
 */
function addHoursToTime(startTime, hours) {
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const totalMinutes = (startHour * 60 + startMinute + hours * 60) % (24 * 60);
  const endHour = Math.floor(totalMinutes / 60);
  const endMinute = totalMinutes % 60;
  return `${String(endHour).padStart(2, "0")}:${String(endMinute).padStart(2, "0")}`;
}

/**
 * hoursBetween
 * Rounds the whole-hour difference between a "HH:mm" start and end
 * time, wrapping past midnight the same way addHoursToTime does. Used
 * to pre-select the matching option in the "Total Hours of Stay"
 * dropdown when editing a rule whose start/end times already imply a
 * whole-hour duration — if the two times don't fall on a whole hour,
 * this returns null and the dropdown simply shows its placeholder
 * instead of guessing wrong.
 */
function hoursBetween(startTime, endTime) {
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);
  const startTotal = startHour * 60 + startMinute;
  const endTotal = endHour * 60 + endMinute;
  const diffMinutes = ((endTotal - startTotal + 24 * 60) % (24 * 60)) || 24 * 60;
  return diffMinutes % 60 === 0 ? diffMinutes / 60 : null;
}

/**
 * computeMultiNightCheckout
 * Section 1, Rule 2 (2+ dates selected): computes the correct
 * check-out TIME and DATE for a multi-night stay.
 *
 * Formula:
 *   ttlHourStay   = hoursOfStayPerNight * numberOfNights   (total hours purchased across every night)
 *   totalMinutes  = check-in time (converted to 24-hour minutes) + ttlHourStay
 *   checkOutTime  = totalMinutes reduced onto a 24-hour clock ("HH:mm")
 *   checkOutDate  = firstSelectedDate + however many full days totalMinutes carries past check-in
 *
 * This replaces the previous logic, which only ever added a SINGLE
 * night's hours to check-in time and always set the check-out date to
 * "last selected date + 1" regardless of how many nights were picked —
 * correct only when hoursOfStayPerNight happens to divide evenly into
 * a full day per night. For any other value (e.g. 21 hours/night
 * across 2 nights) the guest's actual check-out time and date were
 * both wrong, since the second night's hours were never carried in.
 */
function computeMultiNightCheckout(checkInTime, hoursOfStayPerNight, numberOfNights, firstDateKey) {
  const [inHour, inMinute] = checkInTime.split(":").map(Number);
  const inTotalMinutes = inHour * 60 + inMinute;

  const ttlHourStay = hoursOfStayPerNight * numberOfNights;
  const totalMinutes = inTotalMinutes + ttlHourStay * 60;

  const daysCarried = Math.floor(totalMinutes / (24 * 60));
  const wrappedMinutes = totalMinutes % (24 * 60);
  const outHour = Math.floor(wrappedMinutes / 60);
  const outMinute = wrappedMinutes % 60;

  return {
    checkOutTime: `${String(outHour).padStart(2, "0")}:${String(outMinute).padStart(2, "0")}`,
    checkOutDateKey: addDaysToDate(firstDateKey, daysCarried),
  };
}

/**
 * hoursOfStayPerNightFromCheckout
 * Reverses a stored multi-night check-out time back into the original
 * "hours of stay per night" (1-24) that produced it, so the "Total
 * Hours of Stay" dropdown can correctly pre-select itself when editing
 * an existing multi-date rule. Several hoursPerNight values can wrap
 * to the same clock time once multiplied by the number of nights and
 * reduced onto a 24-hour clock, so this checks every 1-24 candidate
 * against computeMultiNightCheckout's own math and returns the one
 * that actually reproduces the stored time — never guesses, so legacy
 * data saved before this formula existed just shows the placeholder
 * instead of a wrong pre-selected value.
 */
function hoursOfStayPerNightFromCheckout(checkInTime, checkOutTime, numberOfNights) {
  // Search from 24 down to 1: several hoursPerNight values can alias to the
  // same wrapped clock time (e.g. 9h and 21h/night both land on the same
  // clock minute across 2 nights, just on different calendar days), and a
  // real nightly stay is almost always close to a full day (18-24h), so the
  // largest match is the far more likely original value.
  for (let hoursPerNight = 24; hoursPerNight >= 1; hoursPerNight -= 1) {
    const candidate = computeMultiNightCheckout(checkInTime, hoursPerNight, numberOfNights, "2000-01-01");
    if (candidate.checkOutTime === checkOutTime) return hoursPerNight;
  }
  return null;
}

/* z.coerce.number() on every numeric field is what actually makes this
   form work — native number inputs hand React Hook Form a string, and
   without coercion that string gets PUT straight to Prisma's Int
   columns, which throws. */
const bookingRuleSchema = z.object({
  name: z.string().min(1, "Give this rule set a name, e.g. \"Regular Season\"."),
  ruleDates: z.array(z.string()).min(1, "Pumili ng kahit isang petsa para sa rule na ito."),
  // Visitor-facing guest count shown as plain text on the public
  // reservation page — replaces the old free-text guest input there.
  allowedGuests: z.coerce.number().int().min(1, "At least 1 guest."),
  maxPax: z.coerce.number().int().min(1, "At least 1 pax."),
  // Package Inclusions — what's shown to the visitor as "Included in
  // this package" on the reservation summary. Both optional/empty by
  // default; an admin isn't required to pick anything.
  includedAmenityIds: z.array(z.string()).default([]),
  // Package Inclusions -> Shop Products checklist — StoreProduct.id
  // values, same pattern as includedAmenityIds above.
  includedProductIds: z.array(z.string()).default([]),
  packageInclusions: z.array(z.string()).default([]),
  checkInTime: z.string().min(1),
  checkOutTime: z.string().min(1),
  allowOvernightStay: z.boolean(),
  allowDayTour: z.boolean(),
  allowNightTour: z.boolean(),
  // Day Tour check-in must fall between 1:00 AM and 11:59 AM.
  dayTourStartTime: z.string().min(1).refine(
    (value) => value >= "01:00" && value <= "11:59",
    "Day Tour check-in must be between 1:00 AM and 11:59 AM."
  ),
  dayTourEndTime: z.string().min(1),
  dayTourPricePerGuest: z.coerce.number().min(0),
  // Night Tour check-in must fall between 1:00 PM and 11:59 PM.
  nightTourStartTime: z.string().min(1).refine(
    (value) => value >= "13:00" && value <= "23:59",
    "Night Tour check-in must be between 1:00 PM and 11:59 PM."
  ),
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
  allowedGuests: 2,
  maxPax: 20,
  includedAmenityIds: [],
  includedProductIds: [],
  packageInclusions: [],
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

export default function BookingRuleForm({ existingRule, rooms, amenities = [], products = [] }) {
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
          allowedGuests: existingRule.allowedGuests ?? 2,
          maxPax: existingRule.maxPax ?? 20,
          includedAmenityIds: existingRule.includedAmenityIds ?? [],
          includedProductIds: existingRule.includedProductIds ?? [],
          packageInclusions: existingRule.packageInclusions ?? [],
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
   * Section 1's calendar click behavior:
   *   - No date selected yet -> selects just the clicked date (range anchor).
   *   - Exactly one date already selected -> clicking the SAME date
   *     deselects it (back to empty); clicking a DIFFERENT date fills
   *     in every date between the anchor and this click, inclusive
   *     (e.g. July 1 selected, then July 5 clicked -> July 1-5 all
   *     selected).
   *   - A range/multiple dates are already selected -> clicking any
   *     date starts a fresh selection with just that date as the new
   *     anchor, so the admin can redo the range without having to
   *     click every day off one at a time.
   * Selecting 2+ dates forces booking type to Overnight (Customized) —
   * Day/Night Tour only make sense for a single day, so a stale
   * selection from single-date mode can't linger once a range is picked.
   */
  const includedAmenityIds = watch("includedAmenityIds") ?? [];
  const includedProductIds = watch("includedProductIds") ?? [];
  const packageInclusions = watch("packageInclusions") ?? [];
  // Text currently typed into the "Add a custom inclusion" input —
  // local only, never touches react-hook-form until the admin actually
  // presses Enter/"Add" (handleAddCustomInclusion below).
  const [customInclusionDraft, setCustomInclusionDraft] = useState("");

  function handleToggleDate(dateKey) {
    setSelectedDates((previousDates) => {
      let nextDates;

      if (previousDates.size === 0) {
        nextDates = new Set([dateKey]);
      } else if (previousDates.size === 1) {
        const [anchorKey] = previousDates;
        nextDates = anchorKey === dateKey
          ? new Set()
          : new Set(getDateRangeKeys(anchorKey, dateKey));
      } else {
        nextDates = new Set([dateKey]);
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

  /**
   * handleToggleIncludedAmenity
   * Checkbox toggle for the Package Inclusions -> Amenities checklist.
   */
  function handleToggleIncludedAmenity(amenityId) {
    const next = includedAmenityIds.includes(amenityId)
      ? includedAmenityIds.filter((id) => id !== amenityId)
      : [...includedAmenityIds, amenityId];
    setValue("includedAmenityIds", next, { shouldValidate: true });
  }

  /**
   * handleToggleIncludedProduct
   * Checkbox toggle for the Package Inclusions -> Shop Products
   * checklist. Wires the Resort Shop catalog into this rule set the
   * same way handleToggleIncludedAmenity wires the Amenity catalog.
   */
  function handleToggleIncludedProduct(productId) {
    const next = includedProductIds.includes(productId)
      ? includedProductIds.filter((id) => id !== productId)
      : [...includedProductIds, productId];
    setValue("includedProductIds", next, { shouldValidate: true });
  }

  /**
   * handleAddCustomInclusion
   * Adds the current draft text (e.g. "Welcome Drinks") to
   * packageInclusions, trimmed and de-duplicated, then clears the input.
   */
  function handleAddCustomInclusion() {
    const trimmed = customInclusionDraft.trim();
    if (!trimmed || packageInclusions.includes(trimmed)) {
      setCustomInclusionDraft("");
      return;
    }
    setValue("packageInclusions", [...packageInclusions, trimmed], { shouldValidate: true });
    setCustomInclusionDraft("");
  }

  function handleRemoveCustomInclusion(item) {
    setValue("packageInclusions", packageInclusions.filter((existing) => existing !== item), { shouldValidate: true });
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
  // Read by the "Total Hours of Stay" dropdowns below — each dropdown
  // shows the currently implied duration (start -> end) and, on
  // change, recomputes the matching end time field.
  const checkInTimeSingle = watch("checkInTime");
  const checkOutTimeSingle = watch("checkOutTime");
  const dayTourStartTimeValue = watch("dayTourStartTime");
  const dayTourEndTimeValue = watch("dayTourEndTime");
  const nightTourStartTimeValue = watch("nightTourStartTime");
  const nightTourEndTimeValue = watch("nightTourEndTime");

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

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  /**
   * handleDeleteRuleSet
   * Deletes this rule set from the edit page itself, not just the list
   * page — the list already had a Delete action (BookingRulesListClient),
   * but an admin already viewing/editing a rule set had no way to
   * delete it without navigating back out first. The API route this
   * calls already blocks deleting the currently active rule set or the
   * last remaining one, so those error messages surface here too via
   * the same generic catch/toast pattern as onSubmit above.
   */
  async function handleDeleteRuleSet() {
    try {
      await axios.delete(`/api/superAdmin/settings/booking-rules/${existingRule.id}`);
      showToast(`✓ "${existingRule.name}" deleted successfully.`, "success");
      router.push("/superAdmin/settings/booking-rules");
    } catch (deleteError) {
      const message = deleteError?.response?.data?.message || "Failed to delete booking rule set.";
      showToast(`✕ ${message}`, "error");
    } finally {
      setIsDeleteModalOpen(false);
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

          {/* --- Allowed Guests — applies to every rule set regardless
               of how many dates are selected. This is now the single
               source of truth for guest count: the public reservation
               page reads it off the matched rule and shows it as plain
               text instead of letting the guest type an arbitrary
               number. --- */}
          <div className="bookingRulesFormField">
            <label htmlFor="allowedGuests">Allowed Guests</label>
            <input id="allowedGuests" type="number" min="1" {...register("allowedGuests")} />
            {errors.allowedGuests && (
              <span role="alert" className="bookingRulesFormError">{errors.allowedGuests.message}</span>
            )}
          </div>

          {/* --- Total Pax (field name stays maxPax) — the MAX capacity
               for this package, not to be confused with Allowed Guests
               above. Allowed Guests is the fixed guest count shown on
               the Overnight summary (never editable by the visitor);
               Total Pax is the hard ceiling on how many pax a Day Tour /
               Night Tour guest can enter in their own editable
               guest-count field, and is now also shown as its own
               "Total Pax" line on every visitor-facing package details
               box (Overnight, Day Tour, Night Tour) for consistency.
               Enforced
               server-side too — see services/bookingPricing.js. --- */}
          <div className="bookingRulesFormField">
            <label htmlFor="maxPax">Total Pax</label>
            <input id="maxPax" type="number" min="1" {...register("maxPax")} />
            <p className="bookingRulesSectionSubtitle">Pinakamaraming pax na pwede sa package na ito (Day Tour / Night Tour guest count cap). Makikita rin ito bilang "Total Pax" sa package details ng visitor.</p>
            {errors.maxPax && (
              <span role="alert" className="bookingRulesFormError">{errors.maxPax.message}</span>
            )}
          </div>

          {/* --- Package Inclusions — what the admin says is included
               in this package, shown to the visitor on the read-only
               reservation summary page under "Included in this
               package". Two pickers: a checklist reusing the resort's
               already-managed Amenity catalog, and a free-text tag
               list for package-specific extras (e.g. "Welcome
               Drinks") that aren't a resort amenity. --- */}
          <div className="bookingRulesSubPanel">
            <p className="bookingRulesSubPanelTitle">Package Inclusions</p>
            <p className="bookingRulesSectionSubtitle">Piliin kung ano ang kasama sa package na ito — makikita ito ng visitor sa reservation page.</p>

            {amenities.length > 0 ? (
              <div className="bookingRulesInclusionsChecklist">
                {amenities.map((amenity) => (
                  <label key={amenity.id} className="bookingRulesToggle">
                    <input
                      type="checkbox"
                      checked={includedAmenityIds.includes(amenity.id)}
                      onChange={() => handleToggleIncludedAmenity(amenity.id)}
                    />
                    {amenity.name}
                  </label>
                ))}
              </div>
            ) : (
              <p className="bookingRulesHint">Wala pang amenities na naka-configure. Pwede mo pa ring magdagdag ng custom na inclusion sa ibaba.</p>
            )}

            {/* --- Shop Products — wires the Resort Shop catalog into
                 this package the same way the Amenities checklist
                 above wires the Amenity catalog. Checking a product
                 here links its live name/price into the visitor-facing
                 "Included in this package" summary instead of the
                 admin retyping it as free text. --- */}
            <p className="bookingRulesInclusionsSubheading">Shop Products</p>
            {products.length > 0 ? (
              <div className="bookingRulesInclusionsChecklist">
                {products.map((product) => (
                  <label key={product.id} className="bookingRulesToggle">
                    <input
                      type="checkbox"
                      checked={includedProductIds.includes(product.id)}
                      onChange={() => handleToggleIncludedProduct(product.id)}
                    />
                    {product.name} — ₱{product.price}
                  </label>
                ))}
              </div>
            ) : (
              <p className="bookingRulesHint">Wala pang shop products na naka-configure. Magdagdag muna sa Content &gt; Resort Shop.</p>
            )}

            <div className="bookingRulesCustomInclusionRow">
              <input
                id="customInclusionDraft"
                type="text"
                placeholder="e.g. Welcome Drinks, Free Breakfast"
                value={customInclusionDraft}
                onChange={(event) => setCustomInclusionDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleAddCustomInclusion();
                  }
                }}
              />
              <button type="button" className="bookingRulesAddInclusionButton" onClick={handleAddCustomInclusion}>
                Add
              </button>
            </div>

            {packageInclusions.length > 0 && (
              <div className="bookingRulesInclusionTags">
                {packageInclusions.map((item) => (
                  <span key={item} className="bookingRulesInclusionTag">
                    {item}
                    <button
                      type="button"
                      aria-label={`Remove ${item}`}
                      onClick={() => handleRemoveCustomInclusion(item)}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

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
                <div className="bookingRulesFormGrid3x2">
                  <div className="bookingRulesFormField">
                    <label>Check-in Date</label>
                    <p className="bookingRulesStaticDate">{formatDisplayDate(Array.from(selectedDates)[0])}</p>
                  </div>
                  <div className="bookingRulesFormField">
                    <label htmlFor="checkInTimeSingle">Check-in Time</label>
                    <input id="checkInTimeSingle" type="time" {...register("checkInTime")} />
                  </div>
                  <div className="bookingRulesFormField">
                    <label htmlFor="overnightStayHours">Total Hours of Stay</label>
                    <select
                      id="overnightStayHours"
                      value={hoursBetween(checkInTimeSingle, checkOutTimeSingle) ?? ""}
                      onChange={(event) => {
                        const hours = Number(event.target.value);
                        setValue("checkOutTime", addHoursToTime(checkInTimeSingle, hours), { shouldValidate: true });
                      }}
                    >
                      <option value="" disabled>Select hours…</option>
                      {Array.from({ length: 24 }, (_, index) => index + 1).map((hours) => (
                        <option key={hours} value={hours}>{hours} hour{hours > 1 ? "s" : ""}</option>
                      ))}
                    </select>
                    <p className="bookingRulesHint">Awtomatikong kina-calculate ang Check-out Time sa ibaba base dito.</p>
                  </div>
                  <div className="bookingRulesFormField">
                    <label>Check-out Date</label>
                    <p className="bookingRulesStaticDate">{formatDisplayDate(addOneDay(Array.from(selectedDates)[0]))}</p>
                  </div>
                  <div className="bookingRulesFormField">
                    <label htmlFor="checkOutTimeSingle">Check-out Time</label>
                    <input id="checkOutTimeSingle" type="time" {...register("checkOutTime")} />
                  </div>
                  <div className="bookingRulesFormField">
                    <label htmlFor="hourlyChargeAmountSingle">Hourly Charge (₱)</label>
                    <input
                      id="hourlyChargeAmountSingle"
                      type="number"
                      step="0.01"
                      min="0"
                      {...register("hourlyChargeAmount")}
                    />
                    {errors.hourlyChargeAmount && (
                      <span role="alert" className="bookingRulesFormError">{errors.hourlyChargeAmount.message}</span>
                    )}
                  </div>
                </div>
              )}

              {allowDayTour && (
                <div className="bookingRulesFormRow">
                  <div className="bookingRulesFormField">
                    <label>Check-in Date</label>
                    <p className="bookingRulesStaticDate">{formatDisplayDate(Array.from(selectedDates)[0])}</p>
                  </div>
                  <div className="bookingRulesFormField">
                    <label htmlFor="dayTourStartTime">Check-in Time</label>
                    <input id="dayTourStartTime" type="time" min="01:00" max="11:59" {...register("dayTourStartTime")} />
                    {errors.dayTourStartTime && <span role="alert" className="bookingRulesFormError">{errors.dayTourStartTime.message}</span>}
                  </div>
                  <div className="bookingRulesFormField">
                    <label htmlFor="dayTourHours">Total Hours of Stay</label>
                    <select
                      id="dayTourHours"
                      value={hoursBetween(dayTourStartTimeValue, dayTourEndTimeValue) ?? ""}
                      onChange={(event) => {
                        const hours = Number(event.target.value);
                        setValue("dayTourEndTime", addHoursToTime(dayTourStartTimeValue, hours), { shouldValidate: true });
                      }}
                    >
                      <option value="" disabled>Select hours…</option>
                      {Array.from({ length: 12 }, (_, index) => index + 1).map((hours) => (
                        <option key={hours} value={hours}>{hours} hour{hours > 1 ? "s" : ""}</option>
                      ))}
                    </select>
                    <p className="bookingRulesHint">Awtomatikong kina-calculate ang Check-out Time sa ibaba base dito.</p>
                  </div>
                  <div className="bookingRulesFormField">
                    <label>Check-out Date</label>
                    <p className="bookingRulesStaticDate">{formatDisplayDate(Array.from(selectedDates)[0])}</p>
                  </div>
                  <div className="bookingRulesFormField">
                    <label htmlFor="dayTourEndTime">Check-out Time</label>
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
                    <label>Check-in Date</label>
                    <p className="bookingRulesStaticDate">{formatDisplayDate(Array.from(selectedDates)[0])}</p>
                  </div>
                  <div className="bookingRulesFormField">
                    <label htmlFor="nightTourStartTime">Check-in Time</label>
                    <input id="nightTourStartTime" type="time" min="13:00" max="23:59" {...register("nightTourStartTime")} />
                    {errors.nightTourStartTime && <span role="alert" className="bookingRulesFormError">{errors.nightTourStartTime.message}</span>}
                  </div>
                  <div className="bookingRulesFormField">
                    <label htmlFor="nightTourHours">Total Hours of Stay</label>
                    <select
                      id="nightTourHours"
                      value={hoursBetween(nightTourStartTimeValue, nightTourEndTimeValue) ?? ""}
                      onChange={(event) => {
                        const hours = Number(event.target.value);
                        setValue("nightTourEndTime", addHoursToTime(nightTourStartTimeValue, hours), { shouldValidate: true });
                      }}
                    >
                      <option value="" disabled>Select hours…</option>
                      {Array.from({ length: 12 }, (_, index) => index + 1).map((hours) => (
                        <option key={hours} value={hours}>{hours} hour{hours > 1 ? "s" : ""}</option>
                      ))}
                    </select>
                    <p className="bookingRulesHint">Awtomatikong kina-calculate ang Check-out Time sa ibaba base dito.</p>
                  </div>
                  <div className="bookingRulesFormField">
                    <label>Check-out Date</label>
                    <p className="bookingRulesStaticDate">{formatDisplayDate(Array.from(selectedDates)[0])}</p>
                  </div>
                  <div className="bookingRulesFormField">
                    <label htmlFor="nightTourEndTime">Check-out Time</label>
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

          {/* --- Rule 2: two or more dates selected ---
               Same "Uri ng Booking" + 3x2 grid design as the single-date
               panel above (Rule 1) for visual/structural consistency —
               only Overnight Stay applies once 2+ dates are picked (Day
               Tour / Night Tour are single-day only), so those two radios
               render disabled here instead of being hidden entirely. */}
          {selectedDates.size > 1 && (() => {
            // Section 1, Rule 2 data flow: the number of selected dates IS
            // the number of nights (per the hint text below), and the
            // check-out time/date are derived from the multi-night formula
            // above rather than reused as-is from the single-night panel.
            const numberOfNights = selectedDates.size;
            const firstDateKey = Array.from(selectedDates).sort()[0];
            const hoursOfStayPerNightMulti = hoursOfStayPerNightFromCheckout(
              checkInTimeSingle,
              checkOutTimeSingle,
              numberOfNights
            );
            const multiNightCheckout = hoursOfStayPerNightMulti
              ? computeMultiNightCheckout(checkInTimeSingle, hoursOfStayPerNightMulti, numberOfNights, firstDateKey)
              : null;

            return (
              <div className="bookingRulesSubPanel">
                <p className="bookingRulesSubPanelTitle">Uri ng Booking</p>
                <div className="bookingRulesToggleRow">
                  <label className="bookingRulesToggle">
                    <input type="radio" name="multiDateBookingType" checked readOnly disabled />
                    Overnight Stay (tulugan, may room)
                  </label>
                  <label className="bookingRulesToggle bookingRulesToggle--disabled">
                    <input type="radio" name="multiDateBookingType" disabled />
                    Day Tour (araw lang, walang room)
                  </label>
                  <label className="bookingRulesToggle bookingRulesToggle--disabled">
                    <input type="radio" name="multiDateBookingType" disabled />
                    Night Tour (gabi lang, walang room)
                  </label>
                </div>
                <p className="bookingRulesHint">
                  {selectedDates.size} na petsa ({selectedDates.size} gabi) ang napili — overnight lagi ang type kapag
                  maraming petsa ang pinili; ang Day Tour at Night Tour ay para sa iisang araw lang.
                </p>

                <div className="bookingRulesFormGrid3x2">
                  <div className="bookingRulesFormField">
                    <label>Check-in Date</label>
                    <p className="bookingRulesStaticDate">{formatDisplayDate(firstDateKey)}</p>
                  </div>
                  <div className="bookingRulesFormField">
                    <label htmlFor="checkInTimeMulti">Check-in Time</label>
                    <input id="checkInTimeMulti" type="time" {...register("checkInTime")} />
                  </div>
                  <div className="bookingRulesFormField">
                    <label htmlFor="multiStayHours">Total Hours of Stay (kada gabi)</label>
                    <select
                      id="multiStayHours"
                      value={hoursOfStayPerNightMulti ?? ""}
                      onChange={(event) => {
                        const hoursPerNight = Number(event.target.value);
                        const { checkOutTime } = computeMultiNightCheckout(
                          checkInTimeSingle,
                          hoursPerNight,
                          numberOfNights,
                          firstDateKey
                        );
                        setValue("checkOutTime", checkOutTime, { shouldValidate: true });
                      }}
                    >
                      <option value="" disabled>Select hours…</option>
                      {Array.from({ length: 24 }, (_, index) => index + 1).map((hours) => (
                        <option key={hours} value={hours}>{hours} hour{hours > 1 ? "s" : ""}</option>
                      ))}
                    </select>
                    <p className="bookingRulesHint">
                      Awtomatikong kina-calculate ang Check-out Date &amp; Time sa ibaba base sa oras kada gabi ×
                      {" "}{numberOfNights} gabi.
                    </p>
                  </div>
                  <div className="bookingRulesFormField">
                    <label>Check-out Date</label>
                    <p className="bookingRulesStaticDate">
                      {multiNightCheckout ? formatDisplayDate(multiNightCheckout.checkOutDateKey) : "—"}
                    </p>
                  </div>
                  <div className="bookingRulesFormField">
                    <label htmlFor="checkOutTimeMulti">Check-out Time</label>
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
            );
          })()}
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

        {/* --- Section 5: Seasonal Pricing (enable toggle + the Philippine
             Peak/Off season reference below — the per-room override list
             itself is still managed on the list page) --- */}
        <div className="bookingRulesSection">
          <h2 className="bookingRulesSectionTitle">Section 5: Seasonal Pricing</h2>
          <p className="bookingRulesSectionSubtitle">I-on o i-off ang special pricing para sa mga piling petsa (hal. Peak Season, Off-Season) habang active ang rule set na ito.</p>
          <label className="bookingRulesToggle">
            <input type="checkbox" {...register("seasonalPricingEnabled")} />
            I-enable ang seasonal pricing
          </label>
          <p className="bookingRulesHint">
            Kapag naka-on ito, gagamitin ng system ang mga per-room seasonal price na naka-set sa
            &quot;Seasonal Pricing&quot; list sa Booking Rules page (hal. ibang rate ang isang room tuwing
            Peak Season). Kapag naka-off, regular rate lagi ang gagamitin ng bawat room, kahit may
            naka-configure na seasonal price para dito.
          </p>

          <SeasonDefinitionsPanel showToast={showToast} />
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
          {/* Delete only makes sense once the rule set already exists —
              never shown in create mode. Placed on its own so it never
              sits directly next to "Save Changes," reducing the chance
              of a misclick between them. */}
          {isEditMode && (
            <button
              type="button"
              className="bookingRulesButton bookingRulesButton--destructive"
              onClick={() => setIsDeleteModalOpen(true)}
            >
              Delete Rule Set
            </button>
          )}
          <button type="submit" className="bookingRulesButton bookingRulesButton--primary" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : isEditMode ? "Save Changes" : "Create Rule Set"}
          </button>
        </div>
      </form>

      {isEditMode && (
        <ConfirmationModal
          isOpen={isDeleteModalOpen}
          title="Delete Rule Set?"
          description={`Are you sure you want to delete "${existingRule?.name}"? This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={handleDeleteRuleSet}
          onCancel={() => setIsDeleteModalOpen(false)}
        />
      )}
    </section>
  );
}