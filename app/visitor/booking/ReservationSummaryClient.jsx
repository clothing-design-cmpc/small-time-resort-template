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

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { usePublicRoom } from "@/hooks/usePublicRoom";
import { usePublicBookingRules } from "@/hooks/usePublicBookingRules";
import { useBookingSubmission } from "@/hooks/useBookingSubmission";
import { formatTime12Hour } from "@/utils/formatTime";
import { buildMessengerLink, isMobileUserAgent } from "@/utils/messagingLinks";
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

export default function ReservationSummaryClient({ checkInDate, checkOutDate, roomId, ruleId, resortPhone, resortMessengerUsername }) {
  const router = useRouter();
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
  const { toasts, showToast, dismissToast } = useToast();

  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [confirmedBooking, setConfirmedBooking] = useState(null);
  // Guards against firing the auto-download more than once (e.g. a
  // parent re-render) — only the very first time a booking gets
  // confirmed should trigger it.
  const hasAutoDownloadedInvoice = useRef(false);
  // Holds the pre-opened blank tab (desktop) plus the Messenger link
  // and device type captured at submit time — set once in onSubmit,
  // read once by the auto-download effect below once the invoice PDF
  // has actually started downloading. Kept in a ref (not state) since
  // it never needs to trigger a re-render on its own.
  const pendingMessengerHandoffRef = useRef(null);

  // Auto-downloads the invoice PDF the moment the confirmation panel
  // appears, so the guest doesn't have to find and click the
  // "Download Invoice" button themselves before heading to Messenger.
  // Triggered via a hidden <a download> click (not window.open) so it
  // never gets blocked as a popup and never navigates the tab away —
  // the server's Content-Disposition: attachment header does the rest.
  //
  // The Messenger hand-off (see onSubmit below for why a blank tab is
  // pre-opened on desktop) is deliberately fired AFTER this download,
  // not the moment the booking succeeds — the guest should see/get the
  // invoice file first, then get routed to Messenger to send it. A
  // short delay after the click() gives the browser time to actually
  // start the download before we redirect/open Messenger.
  useEffect(() => {
    if (!confirmedBooking?.booking?.id || hasAutoDownloadedInvoice.current) return;
    hasAutoDownloadedInvoice.current = true;

    const link = document.createElement("a");
    link.href = `/api/bookings/${confirmedBooking.booking.id}/invoice`;
    link.download = `invoice-${confirmedBooking.booking.referenceCode || confirmedBooking.booking.id}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    const handoff = pendingMessengerHandoffRef.current;
    if (!handoff?.messengerLink) return;

    const handoffTimer = setTimeout(() => {
      if (handoff.isMobile) {
        // Same-tab redirect — m.me is registered as a universal/app
        // link, so the OS hands this off straight to the installed
        // Facebook or Messenger app (whichever claims it) instead of
        // opening in the mobile browser. Falls back to Messenger's
        // own mobile web chat if neither app is installed.
        window.location.href = handoff.messengerLink;
      } else if (handoff.messengerWindow) {
        // Desktop: the pre-opened tab now navigates to Messenger's
        // web chat, keeping this tab on the confirmation page (with
        // the invoice download and reference code) instead of
        // losing it to a full-page redirect.
        handoff.messengerWindow.location.href = handoff.messengerLink;
      }
    }, 1200);

    return () => clearTimeout(handoffTimer);
  }, [confirmedBooking]);
  // Tracks the last quote-conflict message already toasted, so the
  // debounced quote refetch below doesn't re-toast the identical
  // message on every re-render — only a genuinely NEW conflict fires.
  const lastToastedConflictRef = useRef(null);

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
        lastToastedConflictRef.current = null;
      } catch (error) {
        setQuote(null);
        setQuoteError(error.message);
        // Stop here and surface it immediately as a toast — a
        // turnover/cleaning-buffer or blackout conflict means this
        // room+date genuinely isn't bookable, so the guest is told
        // right away instead of only finding out after filling in
        // contact info and pressing Confirm.
        if (lastToastedConflictRef.current !== error.message) {
          showToast(`✕ ${error.message}`, "error");
          lastToastedConflictRef.current = error.message;
        }
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [roomId, checkInDate, checkOutDate, numberOfGuests, fetchQuote]);

  async function onSubmit(guestInfo) {
    setSubmitError(null);

    // Same auto-open pattern as BookingFormClient.jsx — see the detailed
    // comment there. Blank tab opened synchronously (before the await)
    // so desktop browsers don't block it; mobile redirects the current
    // tab so the OS hands off straight to the Facebook/Messenger app.
    // The actual navigation is deferred to the invoice auto-download
    // effect above (via pendingMessengerHandoffRef) so the guest gets
    // the PDF first, then gets routed to Messenger.
    const messengerLink = buildMessengerLink(resortMessengerUsername);
    const isMobile = isMobileUserAgent();
    const messengerWindow = messengerLink && !isMobile ? window.open("", "_blank") : null;

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
      pendingMessengerHandoffRef.current = { messengerLink, isMobile, messengerWindow };
    } catch (error) {
      setSubmitError(error.message);
      if (messengerWindow) messengerWindow.close();
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
          We've received your booking request and are holding your dates. To confirm it, download your
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
          {confirmedQuote.room && (
            <>
              <dt>Room</dt>
              <dd>{confirmedQuote.room.name}</dd>
            </>
          )}
          <dt>Check-in</dt>
          <dd>{FULL_DATE.format(new Date(`${confirmedQuote.checkInDate}T00:00:00`))} at {formatTime12Hour(confirmedQuote.checkInTime)}</dd>
          {confirmedQuote.nights > 0 && (
            <>
              <dt>Check-out</dt>
              <dd>{FULL_DATE.format(new Date(`${confirmedQuote.checkOutDate}T00:00:00`))} at {formatTime12Hour(confirmedQuote.checkOutTime)}</dd>
            </>
          )}
          <dt>Total</dt>
          <dd>{PESO.format(confirmedQuote.total)}</dd>
          {confirmedQuote.promoNightsDiscounted > 0 && (
            <>
              <dt>Promo</dt>
              <dd>
                Applied on {confirmedQuote.promoNightsDiscounted}{" "}
                {confirmedQuote.promoNightsDiscounted === 1 ? "date" : "dates"}
              </dd>
            </>
          )}
          {confirmedQuote.depositRequired && (
            <>
              <dt>Deposit due</dt>
              <dd>{PESO.format(confirmedQuote.depositAmount)}</dd>
            </>
          )}
        </dl>
        {/* Same-Day Check-In Policy (auto_adjust) — only rendered when the
            booking was submitted after today's normal start time and the
            active rule set is on "auto_adjust". Tells the guest their
            actual arrival/departure moment, since it's later than the
            package's standard check-in/out time shown above. */}
        {confirmedBookingRecord?.effectiveCheckInAt && (
          <p className="bookingConfirmAdjustedNotice">
            Since this booking was made after today&apos;s normal check-in time, your check-in has
            been adjusted to <strong>{FULL_DATE_TIME.format(new Date(confirmedBookingRecord.effectiveCheckInAt))}</strong>
            {confirmedBookingRecord.effectiveCheckOutAt && (
              <>
                {" "}and check-out to{" "}
                <strong>{FULL_DATE_TIME.format(new Date(confirmedBookingRecord.effectiveCheckOutAt))}</strong>
              </>
            )}{" "}
            — your full paid duration is preserved.
          </p>
        )}
        <p className="bookingConfirmPolicy">
          {confirmedQuote.isNearTermNonRefundable ? (
            <>
              ⚠ This booking was made within {confirmedQuote.cancellationCutoffDays} day(s) of check-in, so
              the usual free-cancellation window doesn&apos;t apply — your deposit is non-refundable if you
              cancel.
            </>
          ) : (
            <>
              Free cancellation up to {confirmedQuote.cancellationCutoffDays} day(s) before check-in (
              {confirmedQuote.refundPercentage}% refund).
            </>
          )}
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
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      <button type="button" className="reservationSummaryBackLink" onClick={() => router.back()}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Back
      </button>
      {/* ─── Read-only text summary — package, dates, room, guests, and
          included amenities. Nothing here is an editable input; the
          visitor already made these choices on the homepage calendar
          and RoomSelectionModal. ─── */}
      <dl className="reservationSummaryDetails">
        <dt>Package</dt>
        <dd>{bookingRules.matchedRuleName || "Overnight Stay"}</dd>

        <dt>Check-in</dt>
        <dd>{formatDateText(checkInDate)} at {formatTime12Hour(bookingRules.checkInTime)}</dd>

        <dt>Check-out</dt>
        <dd>{formatDateText(checkOutDate || checkInDate)} at {formatTime12Hour(bookingRules.checkOutTime)}</dd>

        <dt>Room / Villa</dt>
        <dd>{room.name} — {room.bedType} bed</dd>

        <dt>Max Number of Guests</dt>
        <dd>{numberOfGuests ?? "—"}</dd>

        <dt>Total Pax</dt>
        <dd>{bookingRules.maxPax ?? "—"} pax max</dd>

        <dt>Extra Guest Fee</dt>
        <dd>
          {bookingRules.extraGuestFeePerHead > 0
            ? `${PESO.format(bookingRules.extraGuestFeePerHead)}/head — charged on-site for guests beyond the Max Number of Guests above.`
            : "No extra guest fee for this package."}
        </dd>

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
          {/* Promo Date discount check (Section 5b / Task 3) — mirrors
              the same banner in BookingFormClient.jsx so a promo
              applied to this stay is never silently baked into the
              total with no explanation, regardless of which of the
              three booking-confirm pages the guest lands on. */}
          {quote.promoNightsDiscounted > 0 && (
            <p className="bookingQuotePromoBanner">
              🎉 Promo applied — discount for {quote.promoNightsDiscounted}{" "}
              {quote.promoNightsDiscounted === 1 ? "date" : "dates"} already included in your total below.
            </p>
          )}
          {quote.nights > 0 && <p className="bookingQuoteRow"><span>Nights</span><span>{quote.nights}</span></p>}
          <p className="bookingQuoteRow bookingQuoteRowTotal"><span>Total</span><span>{PESO.format(quote.total)}</span></p>
          {quote.depositRequired && (
            <p className="bookingQuoteRow"><span>Deposit due now</span><span>{PESO.format(quote.depositAmount)}</span></p>
          )}
          <p className="bookingQuotePolicy">
            {quote.isNearTermNonRefundable ? (
              <>
                ⚠ This booking is within {quote.cancellationCutoffDays} day(s) of check-in — the usual
                free-cancellation window won&apos;t apply, and the deposit will be non-refundable if
                cancelled.
              </>
            ) : (
              <>
                Free cancellation up to {quote.cancellationCutoffDays} day(s) before check-in (
                {quote.refundPercentage}% refund).
              </>
            )}
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

        <button type="submit" className="bookingFormSubmit" disabled={isSubmitting || isFormValidating || Boolean(quoteError)}>
          {isSubmitting ? "Confirming…" : "Confirm Booking"}
        </button>
      </form>
    </div>
  );
}