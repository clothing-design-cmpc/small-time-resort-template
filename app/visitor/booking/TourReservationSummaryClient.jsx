/**
 * FILE: app/visitor/booking/TourReservationSummaryClient.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * The Day Tour / Night Tour counterpart to ReservationSummaryClient.jsx.
 * Once a visitor picks "Day Tour" or "Night Tour" inside
 * components/TourSelectionModal.jsx (only reachable when exactly one
 * date was selected on the homepage calendar), the booking TYPE and
 * DATE are already locked in — this page only ever DISPLAYS those
 * (package name, date, tour time window, price per guest) as plain
 * text, same as the Overnight summary does for room/dates. The only
 * things left for the visitor to fill in are how many guests are
 * coming (it directly changes the price, so it stays an editable
 * input — unlike Overnight, tours have no fixed allowedGuests) and
 * their contact info, before submitting the same /api/bookings
 * endpoint every other booking path uses.
 *
 * DATA FLOW:
 * 1. app/visitor/booking/page.jsx passes checkInDate/bookingType
 *    straight through from the URL (?checkin=&type=day_tour|night_tour)
 * 2. usePublicBookingRules() loads the active rule for both tour types
 *    (package time window + price per guest) — Day Tour and Night Tour
 *    each resolve their own independent active rule regardless of
 *    nights, so nightsSelected is never passed here
 * 3. A debounced live quote (useBookingSubmission.fetchQuote) refetches
 *    whenever numberOfGuests changes, since tour pricing is
 *    perGuestRate * numberOfGuests (see services/bookingPricing.js)
 * 4. On submit, React Hook Form validates guest count + contact info
 *    client-side, then submitBooking() POSTs to /api/bookings with
 *    roomId/checkOutDate both null
 * 5. On success, the page is replaced with the same confirmation panel
 *    shape BookingFormClient.jsx / ReservationSummaryClient.jsx use
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { usePublicBookingRules } from "@/hooks/usePublicBookingRules";
import { useBookingSubmission } from "@/hooks/useBookingSubmission";
import "./BookingForm.css";
import "./ReservationSummary.css";

const PESO = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 });
const FULL_DATE = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

const TOUR_LABELS = { day_tour: "Day Tour", night_tour: "Night Tour" };

/**
 * buildGuestInfoSchema
 * Allowed Pax (BookingRule.maxPax) is a hard cap, not enforced with a
 * static min(1) alone — this is why the schema is built dynamically
 * once the active rule's maxPax is known, instead of a fixed module-
 * level z.object(). The real guarantee is still server-side (Rule 6 —
 * services/bookingPricing.js re-checks numberOfGuests against
 * rules.maxPax on every submit), this is just the UX-level guard so
 * the visitor sees the error before they even hit submit.
 *
 * @param {number} maxPax - the matched rule's Allowed Pax ceiling
 */
function buildGuestInfoSchema(maxPax) {
  return z.object({
    numberOfGuests: z.coerce
      .number()
      .int()
      .min(1, "At least 1 guest.")
      .max(maxPax, `This package allows a maximum of ${maxPax} pax.`),
    guestName: z.string().trim().min(2, "Enter your full name."),
    guestEmail: z.string().trim().email("Enter a valid email address."),
    guestPhone: z.string().trim().min(7, "Enter a valid phone number."),
    notes: z.string().trim().max(500).optional(),
  });
}

function formatDateText(dateKey) {
  if (!dateKey) return "—";
  return FULL_DATE.format(new Date(`${dateKey}T00:00:00`));
}

export default function TourReservationSummaryClient({ checkInDate, bookingType }) {
  const { bookingRules, isLoading: isRulesLoading, error: rulesError } = usePublicBookingRules();
  const { fetchQuote, submitBooking, isSubmitting } = useBookingSubmission();

  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [confirmedBooking, setConfirmedBooking] = useState(null);

  const isAllowed = bookingType === "day_tour" ? bookingRules?.allowDayTour : bookingRules?.allowNightTour;
  const startTime = bookingType === "day_tour" ? bookingRules?.dayTourStartTime : bookingRules?.nightTourStartTime;
  const endTime = bookingType === "day_tour" ? bookingRules?.dayTourEndTime : bookingRules?.nightTourEndTime;
  const pricePerGuest = bookingType === "day_tour" ? bookingRules?.dayTourPricePerGuest : bookingRules?.nightTourPricePerGuest;
  // Allowed Pax — hard cap for this tour type's matched rule. Falls back
  // to a very high ceiling while bookingRules is still loading, so the
  // form doesn't briefly reject valid input before rules arrive.
  const maxPax =
    (bookingType === "day_tour" ? bookingRules?.dayTourMaxPax : bookingRules?.nightTourMaxPax) ?? 999;

  // Rebuilt only when maxPax actually changes — keeps the resolver
  // reference stable across unrelated re-renders (quote refetch, etc.).
  const guestInfoSchema = useMemo(() => buildGuestInfoSchema(maxPax), [maxPax]);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting: isFormValidating },
  } = useForm({
    resolver: zodResolver(guestInfoSchema),
    defaultValues: { numberOfGuests: 2, guestName: "", guestEmail: "", guestPhone: "", notes: "" },
  });

  const numberOfGuests = watch("numberOfGuests");

  // Live quote — refetches whenever the guest count changes, since
  // tour pricing scales directly with numberOfGuests.
  useEffect(() => {
    if (!checkInDate || !bookingType || !numberOfGuests || numberOfGuests < 1) {
      setQuote(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const result = await fetchQuote({
          bookingType,
          roomId: null,
          checkInDate,
          checkOutDate: null,
          numberOfGuests,
        });
        setQuote(result);
        setQuoteError(null);
      } catch (error) {
        setQuote(null);
        setQuoteError(error.message);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [checkInDate, bookingType, numberOfGuests, fetchQuote]);

  async function onSubmit(formValues) {
    setSubmitError(null);
    try {
      const result = await submitBooking({
        ...formValues,
        bookingType,
        roomId: null,
        checkInDate,
        checkOutDate: null,
      });
      setConfirmedBooking(result);
    } catch (error) {
      setSubmitError(error.message);
    }
  }

  /* ─── Confirmation panel — replaces the page entirely on success ───── */
  if (confirmedBooking) {
    const { quote: confirmedQuote, booking: confirmedBookingRecord } = confirmedBooking;
    return (
      <div className="bookingConfirmPanel">
        <span className="bookingConfirmBadge">✓ Booking Confirmed</span>
        <p className="bookingConfirmMessage">
          Thank you! We've reserved your spot and sent a confirmation to your email.
        </p>
        {confirmedBookingRecord?.referenceCode && (
          <div className="bookingConfirmReferenceBox">
            <span className="bookingConfirmReferenceLabel">Your Reference Code</span>
            <span className="bookingConfirmReferenceCode">{confirmedBookingRecord.referenceCode}</span>
            <p className="bookingConfirmReferenceHint">
              Keep this code — you&apos;ll need it to unlock turn-by-turn directions to the resort.
            </p>
            <a
              className="bookingConfirmInvoiceLink"
              href={`/api/bookings/${confirmedBookingRecord.id}/invoice`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Download Invoice (PDF)
            </a>
          </div>
        )}
        <dl className="bookingConfirmSummary">
          <dt>Date</dt>
          <dd>{FULL_DATE.format(new Date(`${confirmedQuote.checkInDate}T00:00:00`))} at {confirmedQuote.checkInTime}</dd>
          <dt>Total</dt>
          <dd>{PESO.format(confirmedQuote.total)}</dd>
          {confirmedQuote.depositRequired && (
            <>
              <dt>Deposit due</dt>
              <dd>{PESO.format(confirmedQuote.depositAmount)}</dd>
            </>
          )}
        </dl>
        <p className="bookingConfirmPolicy">
          Free cancellation up to {confirmedQuote.cancellationCutoffDays} day(s) before check-in
          ({confirmedQuote.refundPercentage}% refund).
        </p>
      </div>
    );
  }

  /* ─── Loading / error states (Rule 25) ──────────────────────────────── */
  if (isRulesLoading) {
    return <p className="bookingFormLoadingText">Loading your reservation details…</p>;
  }

  if (rulesError || !bookingRules) {
    return (
      <div className="reservationSummaryErrorState">
        <p>We couldn't load your reservation's package details. Please try again.</p>
        <a className="reservationSummaryErrorLink" href="/visitor">Back to Availability</a>
      </div>
    );
  }

  if (!isAllowed) {
    return (
      <div className="reservationSummaryErrorState">
        <p>{TOUR_LABELS[bookingType] || "This tour"} isn't available right now. Please try again later.</p>
        <a className="reservationSummaryErrorLink" href="/visitor">Back to Availability</a>
      </div>
    );
  }

  return (
    <div className="reservationSummary">
      {/* ─── Read-only text summary — package, date, and tour time
          window. Nothing here is an editable input; the visitor
          already made these choices on the homepage calendar and
          TourSelectionModal. ─── */}
      <dl className="reservationSummaryDetails">
        <dt>Package</dt>
        <dd>{TOUR_LABELS[bookingType] || "Tour"}</dd>

        <dt>Date</dt>
        <dd>{formatDateText(checkInDate)}</dd>

        <dt>Time</dt>
        <dd>{startTime} – {endTime}</dd>

        <dt>Price per Guest</dt>
        <dd>{PESO.format(Number(pricePerGuest) || 0)}</dd>

        <dt>Included in this package</dt>
        <dd>
          {(() => {
            const includedAmenities = bookingType === "day_tour"
              ? bookingRules.dayTourIncludedAmenities
              : bookingRules.nightTourIncludedAmenities;
            const includedProducts = bookingType === "day_tour"
              ? bookingRules.dayTourIncludedProducts
              : bookingRules.nightTourIncludedProducts;
            const packageInclusions = bookingType === "day_tour"
              ? bookingRules.dayTourPackageInclusions
              : bookingRules.nightTourPackageInclusions;

            const inclusionNames = [
              ...(includedAmenities ?? []).map((amenity) => amenity.name),
              ...(includedProducts ?? []).map((product) => `${product.name} (${PESO.format(product.price)})`),
              ...(packageInclusions ?? []),
            ];
            const uniqueInclusions = Array.from(new Set(inclusionNames));
            return uniqueInclusions.length > 0
              ? uniqueInclusions.join(", ")
              : "No additional inclusions listed for this package.";
          })()}
        </dd>
      </dl>

      {/* ─── Live quote preview ─── */}
      {quoteError && <p className="bookingFormQuoteError" role="alert">{quoteError}</p>}
      {quote && !quoteError && (
        <div className="bookingQuotePanel">
          <p className="bookingQuoteRow bookingQuoteRowTotal"><span>Total</span><span>{PESO.format(quote.total)}</span></p>
          {quote.depositRequired && (
            <p className="bookingQuoteRow"><span>Deposit due now</span><span>{PESO.format(quote.depositAmount)}</span></p>
          )}
          <p className="bookingQuotePolicy">
            Free cancellation up to {quote.cancellationCutoffDays} day(s) before check-in ({quote.refundPercentage}% refund).
          </p>
        </div>
      )}

      {/* ─── Guest count + contact info form — the only interactive
          part of this page. Guest count stays editable (unlike
          Overnight) because tour pricing scales directly with it. ─── */}
      <form className="bookingForm reservationSummaryForm" onSubmit={handleSubmit(onSubmit)} noValidate>
        <p className="bookingFormLegend">* Required fields</p>

        <div className="bookingFormField">
          <label className="bookingFormLabel" htmlFor="numberOfGuests">Number of Guests <span aria-hidden="true">*</span></label>
          <input id="numberOfGuests" type="number" min={1} max={maxPax} className="bookingFormInput" autoFocus {...register("numberOfGuests")} />
          <p className="bookingRulesSectionSubtitle">Max {maxPax} pax para sa package na ito.</p>
          {errors.numberOfGuests && <span className="bookingFormError" role="alert">{errors.numberOfGuests.message}</span>}
        </div>

        <div className="bookingFormRow">
          <div className="bookingFormField">
            <label className="bookingFormLabel" htmlFor="guestName">Full Name <span aria-hidden="true">*</span></label>
            <input id="guestName" type="text" className="bookingFormInput" {...register("guestName")} />
            {errors.guestName && <span className="bookingFormError" role="alert">{errors.guestName.message}</span>}
          </div>
          <div className="bookingFormField">
            <label className="bookingFormLabel" htmlFor="guestPhone">Phone <span aria-hidden="true">*</span></label>
            <input id="guestPhone" type="tel" className="bookingFormInput" {...register("guestPhone")} />
            {errors.guestPhone && <span className="bookingFormError" role="alert">{errors.guestPhone.message}</span>}
          </div>
        </div>

        <div className="bookingFormField">
          <label className="bookingFormLabel" htmlFor="guestEmail">Email <span aria-hidden="true">*</span></label>
          <input id="guestEmail" type="email" className="bookingFormInput" {...register("guestEmail")} />
          {errors.guestEmail && <span className="bookingFormError" role="alert">{errors.guestEmail.message}</span>}
        </div>

        <div className="bookingFormField">
          <label className="bookingFormLabel" htmlFor="notes">Notes (optional)</label>
          <textarea id="notes" className="bookingFormInput bookingFormTextarea" rows={3} {...register("notes")} />
        </div>

        {submitError && <p className="bookingFormSubmitError" role="alert">{submitError}</p>}

        <button type="submit" className="bookingFormSubmit" disabled={isSubmitting || isFormValidating}>
          {isSubmitting ? "Confirming…" : "Confirm Booking"}
        </button>
      </form>
    </div>
  );
}