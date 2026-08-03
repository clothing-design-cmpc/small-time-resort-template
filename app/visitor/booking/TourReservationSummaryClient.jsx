/**
 * FILE: app/visitor/booking/TourReservationSummaryClient.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * The Day Tour / Night Tour counterpart to ReservationSummaryClient.jsx.
 * Once a visitor picks "Day Tour" or "Night Tour" inside
 * components/TourSelectionModal.jsx (only reachable when exactly one
 * date was selected on the homepage calendar, right after picking a
 * room in RoomSelectionModal), the booking TYPE, DATE, and ROOM are
 * already locked in — this page only ever DISPLAYS those (package
 * name, date, tour time window, room, flat room price, Allowed
 * Guests, Total Pax, and the Extra Guest Fee heads-up) as plain text,
 * same as the Overnight summary does for room/dates. Price is now the
 * ROOM's own flat dayTourPrice/nightTourPrice (prisma/schema.prisma) —
 * never multiplied by guest count. There is no guest count input
 * anywhere on this page anymore — headcount isn't always declared
 * honestly upfront, so the online price always covers exactly Allowed
 * Guests, and anyone beyond that (up to Total Pax) pays the Extra
 * Guest Fee to staff once they're actually at the resort. The only
 * thing left for the visitor to fill in is their contact info, before
 * submitting the same /api/bookings endpoint every other booking path
 * uses.
 *
 * DATA FLOW:
 * 1. app/visitor/booking/page.jsx passes checkInDate/bookingType/roomId
 *    straight through from the URL
 *    (?checkin=&type=day_tour|night_tour&roomId=)
 * 2. usePublicBookingRules() loads the active rule for both tour types
 *    (package time window, Allowed Guests, Total Pax, Extra Guest Fee,
 *    inclusions) — Day Tour and Night Tour each resolve their own
 *    independent active rule regardless of nights, so nightsSelected
 *    is never passed here. usePublicRoom(roomId) loads the room itself
 *    (name, capacity, dayTourPrice, nightTourPrice) for the price and
 *    room-name display.
 * 3. A live quote (useBookingSubmission.fetchQuote) fetches once rules
 *    AND the room have loaded, passing roomId through and using the
 *    matched rule's own Allowed Guests as the fixed numberOfGuests —
 *    never refetches from user input since there's no longer a
 *    guest-count field to change
 * 4. On submit, React Hook Form validates only contact info
 *    client-side, then submitBooking() POSTs to /api/bookings with
 *    roomId locked to the room picked upstream, checkOutDate null, and
 *    numberOfGuests fixed to the matched rule's Allowed Guests
 * 5. On success, the page is replaced with the same confirmation panel
 *    shape BookingFormClient.jsx / ReservationSummaryClient.jsx use
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { usePublicBookingRules } from "@/hooks/usePublicBookingRules";
import { usePublicRoom } from "@/hooks/usePublicRoom";
import { useBookingSubmission } from "@/hooks/useBookingSubmission";
import { formatTime12Hour } from "@/utils/formatTime";
import { buildMessengerLink } from "@/utils/messagingLinks";
import { useToast } from "@/app/visitor/shared/useToast";
import ToastStack from "@/app/visitor/shared/ToastStack";
import RebookingPolicyNote from "@/components/shared/RebookingPolicyNote";
import "./BookingForm.css";
import "./ReservationSummary.css";

const PESO = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 });
const FULL_DATE = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
// Formats effectiveCheckInAt/effectiveCheckOutAt ISO timestamps (Same-Day
// Check-In Policy auto-adjust — see services/bookingPricing.js) into a
// readable date + time for the "Adjusted" notice below.
const FULL_DATE_TIME = new Intl.DateTimeFormat("en-US", {
  weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
});

const TOUR_LABELS = { day_tour: "Day Tour", night_tour: "Night Tour" };

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

export default function TourReservationSummaryClient({ checkInDate, bookingType, roomId, resortPhone, resortMessengerUsername }) {
  const { bookingRules, isLoading: isRulesLoading, error: rulesError } = usePublicBookingRules();
  const { room, isLoading: isRoomLoading, error: roomError } = usePublicRoom(roomId);
  const { fetchQuote, submitBooking, isSubmitting } = useBookingSubmission();
  const { toasts, showToast, dismissToast } = useToast();

  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [confirmedBooking, setConfirmedBooking] = useState(null);
  // Guards against firing the auto-download more than once (e.g. a
  // parent re-render) — only the very first time a booking gets
  // confirmed should trigger it.
  const hasAutoDownloadedInvoice = useRef(false);

  // Auto-downloads the invoice PDF the moment the confirmation panel
  // appears, so the guest doesn't have to find and click the
  // "Download Invoice" button themselves before heading to Messenger.
  // Triggered via a hidden <a download> click (not window.open) so it
  // never gets blocked as a popup and never navigates the tab away —
  // the server's Content-Disposition: attachment header does the rest.
  useEffect(() => {
    if (!confirmedBooking?.booking?.id || hasAutoDownloadedInvoice.current) return;
    hasAutoDownloadedInvoice.current = true;

    const link = document.createElement("a");
    link.href = `/api/bookings/${confirmedBooking.booking.id}/invoice`;
    link.download = `invoice-${confirmedBooking.booking.referenceCode || confirmedBooking.booking.id}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [confirmedBooking]);
  // Tracks the last quote-conflict message already toasted, so the
  // debounced quote refetch below doesn't re-toast the identical
  // message on every re-render — only a genuinely NEW conflict (or a
  // fresh one after the guest changes something) fires again.
  const lastToastedConflictRef = useRef(null);

  const isAllowed = bookingType === "day_tour" ? bookingRules?.allowDayTour : bookingRules?.allowNightTour;
  const startTime = bookingType === "day_tour" ? bookingRules?.dayTourStartTime : bookingRules?.nightTourStartTime;
  const endTime = bookingType === "day_tour" ? bookingRules?.dayTourEndTime : bookingRules?.nightTourEndTime;
  const roomPrice = room ? (bookingType === "day_tour" ? room.dayTourPrice : room.nightTourPrice) : null;
  // Total Pax — max on-site capacity for this tour type's matched rule.
  const maxPax = bookingType === "day_tour" ? bookingRules?.dayTourMaxPax : bookingRules?.nightTourMaxPax;
  // Allowed Guests — the fixed count baked into the online price. No
  // input anywhere lets the visitor change this (see file header).
  const numberOfGuests = bookingType === "day_tour" ? bookingRules?.dayTourAllowedGuests : bookingRules?.nightTourAllowedGuests;
  // Extra Guest Fee — informational only, collected by staff on-site.
  const extraGuestFeePerHead = bookingType === "day_tour" ? bookingRules?.dayTourExtraGuestFeePerHead : bookingRules?.nightTourExtraGuestFeePerHead;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting: isFormValidating },
  } = useForm({
    resolver: zodResolver(guestInfoSchema),
    defaultValues: { guestName: "", guestEmail: "", guestPhone: "", notes: "" },
  });

  // Live quote — fetched once the matched rule (and its Allowed Guests
  // count) has loaded. Never refetches from user input since there's
  // no guest-count field on this page anymore.
  useEffect(() => {
    if (!checkInDate || !bookingType || !roomId || !numberOfGuests || numberOfGuests < 1) {
      setQuote(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const result = await fetchQuote({
          bookingType,
          roomId,
          checkInDate,
          checkOutDate: null,
          numberOfGuests,
        });
        setQuote(result);
        setQuoteError(null);
        lastToastedConflictRef.current = null;
      } catch (error) {
        setQuote(null);
        setQuoteError(error.message);
        // Stop here and surface it immediately as a toast — a
        // turnover/cleaning-buffer or blackout conflict means this
        // date+time genuinely isn't bookable, so the guest is told
        // right away instead of only finding out after filling in
        // contact info and pressing Confirm.
        if (lastToastedConflictRef.current !== error.message) {
          showToast(`✕ ${error.message}`, "error");
          lastToastedConflictRef.current = error.message;
        }
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [checkInDate, bookingType, roomId, numberOfGuests, fetchQuote]);

  async function onSubmit(formValues) {
    setSubmitError(null);
    try {
      const result = await submitBooking({
        ...formValues,
        bookingType,
        roomId,
        checkInDate,
        checkOutDate: null,
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
    const messengerLink = buildMessengerLink(resortMessengerUsername);
    return (
      <div className="bookingConfirmPanel">
        <span className="bookingConfirmBadge bookingConfirmBadge--pending">⏳ Booking Pending</span>
        <p className="bookingConfirmMessage">
          We've received your booking request and are holding your spot. To confirm it, download your
          invoice below and send it to us on Facebook Messenger.
        </p>
        {confirmedBookingRecord?.referenceCode && (
          <div className="bookingConfirmReferenceBox">
            <span className="bookingConfirmReferenceLabel">Your Reference Code</span>
            <span className="bookingConfirmReferenceCode">{confirmedBookingRecord.referenceCode}</span>
            <p className="bookingConfirmReferenceHint">
              Keep this code — you&apos;ll need it to unlock turn-by-turn directions once confirmed.
            </p>
            <a
              className="bookingConfirmInvoiceLink"
              href={`/api/bookings/${confirmedBookingRecord.id}/invoice`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Download Invoice (PDF)
            </a>
            <p className="bookingConfirmReferenceHint">
              Your invoice downloads automatically — click the button above again if you don&apos;t see it.
            </p>
            {messengerLink ? (
              <a
                className="bookingConfirmMessengerLink"
                href={messengerLink}
                target="_blank"
                rel="noopener noreferrer"
              >
                Send Invoice on Messenger to Confirm
              </a>
            ) : (
              <p className="bookingConfirmReferenceHint">
                Please contact us directly at <a href={`tel:${resortPhone.replace(/[^\d+]/g, "")}`}>{resortPhone}</a>{" "}
                to confirm your booking.
              </p>
            )}
          </div>
        )}
        <dl className="bookingConfirmSummary">
          <dt>Date</dt>
          <dd>{FULL_DATE.format(new Date(`${confirmedQuote.checkInDate}T00:00:00`))} at {formatTime12Hour(confirmedQuote.checkInTime)}</dd>
          <dt>Room</dt>
          <dd>{confirmedQuote.room?.name ?? room?.name ?? "—"}</dd>
          <dt>Total</dt>
          <dd>{PESO.format(confirmedQuote.total)}</dd>
          {confirmedQuote.depositRequired && (
            <>
              <dt>Deposit due</dt>
              <dd>{PESO.format(confirmedQuote.depositAmount)}</dd>
            </>
          )}
        </dl>
        {/* Same-Day Check-In Policy (auto_adjust) — only rendered when this
            tour was booked after its normal start time today and the
            active rule set is on "auto_adjust". Tells the guest their
            actual arrival/departure moment, since it's later than the
            tour's standard start/end time shown above. */}
        {confirmedBookingRecord?.effectiveCheckInAt && (
          <p className="bookingConfirmAdjustedNotice">
            Since this booking was made after today&apos;s normal start time, your tour start has
            been adjusted to <strong>{FULL_DATE_TIME.format(new Date(confirmedBookingRecord.effectiveCheckInAt))}</strong>
            {confirmedBookingRecord.effectiveCheckOutAt && (
              <>
                {" "}and end time to{" "}
                <strong>{FULL_DATE_TIME.format(new Date(confirmedBookingRecord.effectiveCheckOutAt))}</strong>
              </>
            )}{" "}
            — your full paid duration is preserved.
          </p>
        )}
        <p className="bookingConfirmPolicy">
          Free cancellation up to {confirmedQuote.cancellationCutoffDays} day(s) before check-in
          ({confirmedQuote.refundPercentage}% refund).
        </p>
        <p className="bookingConfirmCancelNote">
          Need to cancel or change this booking? Call us at{" "}
          <a href={`tel:${resortPhone.replace(/[^\d+]/g, "")}`}>{resortPhone}</a> and have your reference code ready.
        </p>
        <RebookingPolicyNote />
      </div>
    );
  }

  /* ─── Loading / error states (Rule 25) ──────────────────────────────── */
  if (isRulesLoading || isRoomLoading) {
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

  if (!roomId || roomError || !room) {
    return (
      <div className="reservationSummaryErrorState">
        <p>{roomError || "Please pick a room for this tour first."}</p>
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
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      {/* ─── Read-only text summary — package, date, tour time window,
          guest count, and pax/fee info. Nothing here is an editable
          input; the visitor already made these choices on the homepage
          calendar and TourSelectionModal, and guest count is fixed by
          the matched rule's Allowed Guests (see file header). ─── */}
      <dl className="reservationSummaryDetails">
        <dt>Package</dt>
        <dd>{TOUR_LABELS[bookingType] || "Tour"}</dd>

        <dt>Date</dt>
        <dd>{formatDateText(checkInDate)}</dd>

        <dt>Time</dt>
        <dd>{formatTime12Hour(startTime)} – {formatTime12Hour(endTime)}</dd>

        <dt>Room</dt>
        <dd>{room.name}</dd>

        <dt>Price</dt>
        <dd>{PESO.format(Number(roomPrice) || 0)}</dd>

        <dt>Max Number of Guests</dt>
        <dd>{numberOfGuests ?? "—"}</dd>

        <dt>Total Pax</dt>
        <dd>{maxPax ?? "—"} pax max</dd>

        <dt>Extra Guest Fee</dt>
        <dd>
          {extraGuestFeePerHead > 0
            ? `${PESO.format(extraGuestFeePerHead)}/head — charged on-site for guests beyond the Max Number of Guests above.`
            : "No extra guest fee for this package."}
        </dd>

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

      {/* ─── Contact info form — the only interactive part of this page.
          Guest count is no longer collected here at all (see file
          header). ─── */}
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

        <button type="submit" className="bookingFormSubmit" disabled={isSubmitting || isFormValidating || Boolean(quoteError)}>
          {isSubmitting ? "Confirming…" : "Confirm Booking"}
        </button>
      </form>
    </div>
  );
}