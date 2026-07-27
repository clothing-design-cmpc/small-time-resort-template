/**
 * FILE: app/visitor/booking/ReservationSummaryClient.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Replaces the interactive booking-type/room/date/guest-count selectors
 * for the flow that starts on the homepage calendar
 * (components/sections/HowToBookSection.jsx) -> RoomSelectionModal.
 * By the time a visitor lands here, the dates and room are already
 * locked in — this page only ever DISPLAYS them (package name,
 * check-in/out date & time, selected room, included amenities, and
 * allowed guest count, all as plain text) and collects the guest's
 * contact info before submitting the same /api/bookings endpoint
 * BookingFormClient.jsx uses.
 *
 * DATA FLOW:
 * 1. app/visitor/booking/page.jsx passes checkInDate/checkOutDate/
 *    roomId/ruleId straight through from the URL
 * 2. usePublicRoom(roomId) loads the selected room (name, bed type,
 *    price, amenities)
 * 3. usePublicBookingRules(nightsSelected) loads the matched rule
 *    (package name, check-in/out time, allowedGuests, deposit/
 *    cancellation terms) — same source HowToBookSection already
 *    validated against, so this never disagrees with what got the
 *    visitor here
 * 4. A live quote (useBookingSubmission.fetchQuote) fills in the price
 *    breakdown once room + rule have both loaded
 * 5. On submit, React Hook Form validates guest info client-side, then
 *    submitBooking() POSTs to /api/bookings with numberOfGuests fixed
 *    to the rule's allowedGuests (never guest-editable here)
 * 6. On success, the page is replaced with the same confirmation panel
 *    shape BookingFormClient.jsx uses
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { usePublicRoom } from "@/hooks/usePublicRoom";
import { usePublicBookingRules } from "@/hooks/usePublicBookingRules";
import { useBookingSubmission } from "@/hooks/useBookingSubmission";
import "./BookingForm.css";
import "./ReservationSummary.css";

const PESO = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 });
const FULL_DATE = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

const guestInfoSchema = z.object({
  guestName: z.string().trim().min(2, "Enter your full name."),
  guestEmail: z.string().trim().email("Enter a valid email address."),
  guestPhone: z.string().trim().min(7, "Enter a valid phone number."),
  notes: z.string().trim().max(500).optional(),
});

function formatDateText(dateKey) {
  if (!dateKey) return "—";
  return FULL_DATE.format(new Date(`${dateKey}T00:00:00`));
}

export default function ReservationSummaryClient({ checkInDate, checkOutDate, roomId, ruleId }) {
  const { room, isLoading: isRoomLoading, error: roomError } = usePublicRoom(roomId);

  const nightsSelected = useMemo(() => {
    if (!checkInDate || !checkOutDate || checkOutDate === checkInDate) return null;
    const inDate = new Date(`${checkInDate}T00:00:00`);
    const outDate = new Date(`${checkOutDate}T00:00:00`);
    const diffDays = Math.round((outDate - inDate) / 86400000);
    return diffDays > 0 ? diffDays : null;
  }, [checkInDate, checkOutDate]);

  const { bookingRules, isLoading: isRulesLoading, error: rulesError } = usePublicBookingRules(nightsSelected);
  const { fetchQuote, submitBooking, isSubmitting } = useBookingSubmission();

  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [confirmedBooking, setConfirmedBooking] = useState(null);

  const numberOfGuests = bookingRules?.allowedGuests ?? null;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting: isFormValidating },
  } = useForm({
    resolver: zodResolver(guestInfoSchema),
    defaultValues: { guestName: "", guestEmail: "", guestPhone: "", notes: "" },
  });

  // Live quote — same preview every other booking path uses, filled in
  // once the room and rule (which supplies numberOfGuests) have both loaded.
  useEffect(() => {
    if (!roomId || !checkInDate || !numberOfGuests) {
      setQuote(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const result = await fetchQuote({
          bookingType: "overnight",
          roomId,
          checkInDate,
          checkOutDate: checkOutDate || checkInDate,
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
  }, [roomId, checkInDate, checkOutDate, numberOfGuests, fetchQuote]);

  async function onSubmit(guestInfo) {
    setSubmitError(null);
    try {
      const result = await submitBooking({
        ...guestInfo,
        bookingType: "overnight",
        roomId,
        checkInDate,
        checkOutDate: checkOutDate || checkInDate,
        numberOfGuests,
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
          Thank you! We've reserved your dates and sent a confirmation to your email.
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
          {confirmedQuote.room && (
            <>
              <dt>Room</dt>
              <dd>{confirmedQuote.room.name}</dd>
            </>
          )}
          <dt>Check-in</dt>
          <dd>{FULL_DATE.format(new Date(`${confirmedQuote.checkInDate}T00:00:00`))} at {confirmedQuote.checkInTime}</dd>
          {confirmedQuote.nights > 0 && (
            <>
              <dt>Check-out</dt>
              <dd>{FULL_DATE.format(new Date(`${confirmedQuote.checkOutDate}T00:00:00`))} at {confirmedQuote.checkOutTime}</dd>
            </>
          )}
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
  if (isRoomLoading || isRulesLoading) {
    return <p className="bookingFormLoadingText">Loading your reservation details…</p>;
  }

  if (roomError || !room) {
    return (
      <div className="reservationSummaryErrorState">
        <p>{roomError || "This room is no longer available."}</p>
        <a className="reservationSummaryErrorLink" href="/visitor">Back to Availability</a>
      </div>
    );
  }

  if (rulesError || !bookingRules) {
    return (
      <div className="reservationSummaryErrorState">
        <p>We couldn't load your reservation's package details. Please try again.</p>
        <a className="reservationSummaryErrorLink" href="/visitor">Back to Availability</a>
      </div>
    );
  }

  return (
    <div className="reservationSummary">
      {/* ─── Read-only text summary — package, dates, room, guests, and
          included amenities. Nothing here is an editable input; the
          visitor already made these choices on the homepage calendar
          and RoomSelectionModal. ─── */}
      <dl className="reservationSummaryDetails">
        <dt>Package</dt>
        <dd>{bookingRules.matchedRuleName || "Overnight Stay"}</dd>

        <dt>Check-in</dt>
        <dd>{formatDateText(checkInDate)} at {bookingRules.checkInTime}</dd>

        <dt>Check-out</dt>
        <dd>{formatDateText(checkOutDate || checkInDate)} at {bookingRules.checkOutTime}</dd>

        <dt>Room / Villa</dt>
        <dd>{room.name} — {room.bedType} bed</dd>

        <dt>Max Number of Guests</dt>
        <dd>{numberOfGuests ?? "—"}</dd>

        <dt>Total Pax</dt>
        <dd>{bookingRules.maxPax ?? "—"} pax max</dd>

        <dt>Included in this package</dt>
        <dd>
          {(() => {
            const inclusionNames = [
              ...room.amenities.map((amenity) => amenity.name),
              ...(bookingRules.includedAmenities ?? []).map((amenity) => amenity.name),
              ...(bookingRules.includedProducts ?? []).map((product) => `${product.name} (${PESO.format(product.price)})`),
              ...(bookingRules.packageInclusions ?? []),
            ];
            const uniqueInclusions = Array.from(new Set(inclusionNames));
            return uniqueInclusions.length > 0
              ? uniqueInclusions.join(", ")
              : "No additional amenities listed for this room.";
          })()}
        </dd>
      </dl>

      {/* ─── Live quote preview ─── */}
      {quoteError && <p className="bookingFormQuoteError" role="alert">{quoteError}</p>}
      {quote && !quoteError && (
        <div className="bookingQuotePanel">
          {quote.nights > 0 && <p className="bookingQuoteRow"><span>Nights</span><span>{quote.nights}</span></p>}
          <p className="bookingQuoteRow bookingQuoteRowTotal"><span>Total</span><span>{PESO.format(quote.total)}</span></p>
          {quote.depositRequired && (
            <p className="bookingQuoteRow"><span>Deposit due now</span><span>{PESO.format(quote.depositAmount)}</span></p>
          )}
          <p className="bookingQuotePolicy">
            Free cancellation up to {quote.cancellationCutoffDays} day(s) before check-in ({quote.refundPercentage}% refund).
          </p>
        </div>
      )}

      {/* ─── Guest info form — the only interactive part of this page ─── */}
      <form className="bookingForm reservationSummaryForm" onSubmit={handleSubmit(onSubmit)} noValidate>
        <p className="bookingFormLegend">* Required fields</p>

        <div className="bookingFormRow">
          <div className="bookingFormField">
            <label className="bookingFormLabel" htmlFor="guestName">Full Name <span aria-hidden="true">*</span></label>
            <input id="guestName" type="text" className="bookingFormInput" autoFocus {...register("guestName")} />
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
