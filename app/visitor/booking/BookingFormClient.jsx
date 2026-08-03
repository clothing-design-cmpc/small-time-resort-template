/**
 * FILE: app/visitor/booking/BookingFormClient.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * The actual booking form: booking type -> room + dates (or a single
 * tour date) -> guest count -> guest info, with a live price/deposit
 * preview and full validation against the super-admin's Booking Rules
 * (min/max nights, advance window, which booking types are enabled,
 * room capacity, blackout dates) before the guest can submit.
 *
 * DATA FLOW:
 * 1. usePublicBookingRules() + usePublicRooms(false) load on mount
 * 2. useRoomAvailability(selectedRoomId) refetches whenever the chosen
 *    room changes, to warn about already-unavailable dates
 * 3. A debounced effect calls fetchQuote() (services/bookingPricing via
 *    /api/bookings/quote) whenever enough fields are filled — this is
 *    a PREVIEW only, nothing is saved yet
 * 4. On submit, React Hook Form validates guest info client-side, then
 *    submitBooking() POSTs to /api/bookings, which re-validates
 *    everything server-side and creates the row
 * 5. On success, the whole form is replaced with a confirmation panel
 */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { usePublicBookingRules } from "@/hooks/usePublicBookingRules";
import { usePublicRooms } from "@/hooks/usePublicRooms";
import { useRoomAvailability } from "@/hooks/useRoomAvailability";
import { useBookingSubmission } from "@/hooks/useBookingSubmission";
import RoomAvailabilityCalendar from "./RoomAvailabilityCalendar";
import { formatTime12Hour } from "@/utils/formatTime";
import { buildMessengerLink } from "@/utils/messagingLinks";
import { useToast } from "@/app/visitor/shared/useToast";
import ToastStack from "@/app/visitor/shared/ToastStack";
import "./BookingForm.css";

const PESO = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 });
const FULL_DATE = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
// Formats effectiveCheckInAt/effectiveCheckOutAt ISO timestamps (Same-Day
// Check-In Policy auto-adjust — see services/bookingPricing.js) into a
// readable date + time for the "Adjusted" notice below.
const FULL_DATE_TIME = new Intl.DateTimeFormat("en-US", {
  weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
});

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const bookingFormSchema = z
  .object({
    bookingType: z.enum(["overnight", "day_tour", "night_tour"]),
    roomId: z.string().optional(),
    checkInDate: z.string().min(1, "Select a date."),
    checkOutDate: z.string().optional(),
    numberOfGuests: z.coerce.number().int().min(1, "At least 1 guest."),
    guestName: z.string().trim().min(2, "Enter your full name."),
    guestEmail: z.string().trim().email("Enter a valid email address."),
    guestPhone: z.string().trim().min(7, "Enter a valid phone number."),
    notes: z.string().trim().max(500).optional(),
  })
  .refine((data) => data.bookingType !== "overnight" || !!data.roomId, {
    message: "Please select a room.",
    path: ["roomId"],
  })
  .refine((data) => data.bookingType !== "overnight" || !!data.checkOutDate, {
    message: "Select a check-out date.",
    path: ["checkOutDate"],
  });

const BOOKING_TYPE_LABELS = {
  overnight: "Overnight Stay",
  day_tour: "Day Tour",
  night_tour: "Night Tour",
};

export default function BookingFormClient({ initialCheckInDate, initialCheckOutDate, initialBookingType, resortPhone, resortMessengerUsername }) {
  const { rooms, isLoading: roomsLoading } = usePublicRooms(false);
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
  // message on every keystroke — only a genuinely NEW conflict fires.
  const lastToastedConflictRef = useRef(null);

  // The home calendar (HowToBookSection) only ever sends ?checkout= when
  // 2+ dates were selected there (see app/visitor/booking/page.jsx) —
  // that case can only ever be an Overnight stay. A single selected
  // date now goes through HowToBookSection's TourSelectionModal first,
  // which sends ?type=overnight (with ?checkout=) / ?type=day_tour /
  // ?type=night_tour depending on what the visitor actually picked
  // there — so by the time this form loads, the type is already known
  // and the guest isn't shown the pill choice again. Only the header's
  // plain "Book Now" link (no query params at all) still lets the
  // guest pick freely below. Captured once on mount (not re-derived
  // from the watched fields below) so it reflects only what was
  // actually chosen upstream, not any later edit the guest makes to
  // the date fields on this page.
  const [lockedBookingType] = useState(() => {
    if (initialCheckOutDate) return "overnight";
    if (initialBookingType && BOOKING_TYPE_LABELS[initialBookingType]) return initialBookingType;
    return null;
  });

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors, isSubmitting: isFormValidating },
  } = useForm({
    resolver: zodResolver(bookingFormSchema),
    defaultValues: {
      bookingType: lockedBookingType || "overnight",
      roomId: "",
      checkInDate: initialCheckInDate || todayKey(),
      checkOutDate: initialCheckOutDate || "",
      numberOfGuests: 2,
      guestName: "",
      guestEmail: "",
      guestPhone: "",
      notes: "",
    },
  });

  const bookingType = watch("bookingType");
  const roomId = watch("roomId");
  const checkInDate = watch("checkInDate");
  const checkOutDate = watch("checkOutDate");
  const numberOfGuests = watch("numberOfGuests");

  // Nights actually selected for an Overnight stay — drives which
  // specific rule set the fetch below matches (e.g. "4Ds-3Ns" vs
  // "3Ds-2Ns" when both are Active), instead of always resolving to
  // whichever Active rule was most recently updated regardless of how
  // many nights the guest actually picked.
  const nightsSelected = useMemo(() => {
    if (bookingType !== "overnight" || !checkInDate || !checkOutDate) return null;
    const checkIn = new Date(`${checkInDate}T00:00:00`);
    const checkOut = new Date(`${checkOutDate}T00:00:00`);
    if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime())) return null;
    const diffDays = Math.round((checkOut - checkIn) / 86400000);
    return diffDays > 0 ? diffDays : null;
  }, [bookingType, checkInDate, checkOutDate]);

  const { bookingRules, isLoading: rulesLoading } = usePublicBookingRules(nightsSelected);

  const { availability } = useRoomAvailability(bookingType === "overnight" ? roomId : null);

  // Which booking types the super-admin currently allows — drives the pill selector below
  const enabledTypes = useMemo(() => {
    if (!bookingRules) return [];
    const types = [];
    if (bookingRules.allowOvernightStay) types.push({ value: "overnight", label: "Overnight Stay" });
    if (bookingRules.allowDayTour) types.push({ value: "day_tour", label: "Day Tour" });
    if (bookingRules.allowNightTour) types.push({ value: "night_tour", label: "Night Tour" });
    return types;
  }, [bookingRules]);

  // Whenever the loaded rules change which types are enabled, make sure the
  // currently selected type is still valid — otherwise fall back to the first enabled one.
  useEffect(() => {
    if (enabledTypes.length > 0 && !enabledTypes.some((t) => t.value === bookingType)) {
      setValue("bookingType", enabledTypes[0].value);
    }
  }, [enabledTypes, bookingType, setValue]);

  /* Debounced live quote preview — recalculates whenever the fields that
     affect price change. Runs the exact same rule checks the final
     submit will, so any violation shows up before the guest even submits. */
  useEffect(() => {
    const hasMinimumInputs =
      bookingType &&
      checkInDate &&
      numberOfGuests > 0 &&
      (bookingType !== "overnight" || (roomId && checkOutDate));

    if (!hasMinimumInputs) {
      setQuote(null);
      setQuoteError(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const result = await fetchQuote({
          bookingType,
          roomId: bookingType === "overnight" ? roomId : null,
          checkInDate,
          checkOutDate: bookingType === "overnight" ? checkOutDate : null,
          numberOfGuests,
        });
        setQuote(result);
        setQuoteError(null);
        lastToastedConflictRef.current = null;
      } catch (error) {
        setQuote(null);
        setQuoteError(error.message);
        // Stop here and surface it immediately as a toast — a
        // turnover/cleaning-buffer or blackout conflict means these
        // dates genuinely aren't bookable, so the guest is told right
        // away instead of only finding out after filling in guest info
        // and pressing Confirm.
        if (lastToastedConflictRef.current !== error.message) {
          showToast(`✕ ${error.message}`, "error");
          lastToastedConflictRef.current = error.message;
        }
      }
    }, 500);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingType, roomId, checkInDate, checkOutDate, numberOfGuests]);

  async function onSubmit(formValues) {
    setSubmitError(null);
    try {
      const result = await submitBooking({
        ...formValues,
        roomId: formValues.bookingType === "overnight" ? formValues.roomId : null,
        checkOutDate: formValues.bookingType === "overnight" ? formValues.checkOutDate : null,
      });
      setConfirmedBooking(result);
    } catch (error) {
      setSubmitError(error.message);
    }
  }

  /* ─── Confirmation panel — replaces the form entirely on success ─────── */
  if (confirmedBooking) {
    const { quote: confirmedQuote, booking: confirmedBookingRecord } = confirmedBooking;
    const messengerLink = buildMessengerLink(resortMessengerUsername);

    // How many hours the guest actually has to send their DP, derived from
    // the two timestamps Prisma already returned on the created row
    // (createdAt / pendingExpiresAt) rather than hardcoding the number here
    // — stays correct even if the super-admin's DP Countdown setting
    // (SystemSettings.pendingHoldHours) changes later, without needing a
    // second constant kept in sync.
    const pendingHoldHours =
      confirmedBookingRecord?.createdAt && confirmedBookingRecord?.pendingExpiresAt
        ? Math.round(
            (new Date(confirmedBookingRecord.pendingExpiresAt) - new Date(confirmedBookingRecord.createdAt)) /
              (60 * 60 * 1000)
          )
        : null;

    return (
      <div className="bookingConfirmPanel">
        <span className="bookingConfirmBadge bookingConfirmBadge--pending">⏳ Booking Pending</span>
        <p className="bookingConfirmMessage">
          We&apos;ve received your booking request and are holding your dates. To confirm it, download your
          invoice below and send it to us on Facebook Messenger.
        </p>
        <div className="bookingConfirmNextSteps">
          <p className="bookingConfirmNextStepsTitle">What happens next</p>
          <ol className="bookingConfirmNextStepsList">
            <li>Make your down payment (DP).</li>
            <li>Send the payment receipt to us on Facebook Messenger.</li>
            <li>
              Wait for the resort owner to confirm your booking
              {pendingHoldHours
                ? confirmedBookingRecord?.pendingHoldCapped
                  ? ` — you have ${pendingHoldHours} hour${pendingHoldHours === 1 ? "" : "s"} from now, until your scheduled time, to send your DP`
                  : ` — you have ${pendingHoldHours} hours from now to send your DP before these dates are released`
                : ""}
              .
            </li>
          </ol>
          <p className="bookingConfirmNextStepsFooter">
            Don&apos;t worry — once your booking is confirmed, you&apos;ll receive an email automatically.
          </p>
        </div>
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
          Free cancellation up to {confirmedQuote.cancellationCutoffDays} day(s) before check-in
          ({confirmedQuote.refundPercentage}% refund).
        </p>
        <p className="bookingConfirmCancelNote">
          Need to change or cancel? Go to the homepage, click the{" "}
          <strong>&quot;Cancellation&quot;</strong> icon at the bottom-right of the screen, then enter your
          reference code there to cancel your booking.
        </p>
      </div>
    );
  }

  if (rulesLoading) {
    return <p className="bookingFormLoadingText">Loading booking options…</p>;
  }

  if (enabledTypes.length === 0) {
    return (
      <p className="bookingBody">
        Online booking is temporarily unavailable. Please reach out through our Contact page
        and our team will help you reserve your room directly.
      </p>
    );
  }

  return (
    <form className="bookingForm" onSubmit={handleSubmit(onSubmit)} noValidate>
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      <p className="bookingFormLegend">* Required fields</p>

      {/* Booking type pills — hidden in favor of a plain locked label
          when the guest already made this choice upstream: either 2+
          dates on the home calendar (always Overnight), or a single
          date run through TourSelectionModal there (Overnight / Day
          Tour / Night Tour, whichever they actually picked). */}
      <div className="bookingFormField">
        <label className="bookingFormLabel">Booking Type <span aria-hidden="true">*</span></label>
        {lockedBookingType ? (
          <div className="bookingTypeLocked">{BOOKING_TYPE_LABELS[lockedBookingType]}</div>
        ) : (
          <Controller
            control={control}
            name="bookingType"
            render={({ field }) => (
              <div className="bookingTypePills">
                {enabledTypes.map((type) => (
                  <button
                    key={type.value}
                    type="button"
                    className={`bookingTypePill${field.value === type.value ? " bookingTypePillActive" : ""}`}
                    onClick={() => field.onChange(type.value)}
                  >
                    {type.label}
                  </button>
                ))}
              </div>
            )}
          />
        )}
        {bookingType === "overnight" && nightsSelected && bookingRules?.matchedRuleName && (
          <p className="bookingFormRuleMatchLarge">
            Package: {bookingRules.matchedRuleName}
            {bookingRules.matchedRuleNights === nightsSelected ? "" : " (default rate — no exact match for this night count)"}
          </p>
        )}
      </div>

      {/* Overnight-only: room select */}
      {bookingType === "overnight" && (
        <div className="bookingFormField">
          <label className="bookingFormLabel" htmlFor="roomId">Room / Villa <span aria-hidden="true">*</span></label>
          <select id="roomId" className="bookingFormInput" {...register("roomId")} disabled={roomsLoading}>
            <option value="">{roomsLoading ? "Loading rooms…" : "Select a room"}</option>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name} — {PESO.format(room.pricePerNight)}/night (up to {room.capacity} guests)
              </option>
            ))}
          </select>
          {errors.roomId && <span className="bookingFormError" role="alert">{errors.roomId.message}</span>}
        </div>
      )}

      {/* Dates */}
      <div className="bookingFormRow">
        <div className="bookingFormField">
          <label className="bookingFormLabel" htmlFor="checkInDate">
            {bookingType === "overnight" ? "Check-in" : "Date"} <span aria-hidden="true">*</span>
          </label>
          <input
            id="checkInDate"
            type="date"
            className="bookingFormInput"
            min={todayKey()}
            autoFocus
            {...register("checkInDate")}
          />
          {errors.checkInDate && <span className="bookingFormError" role="alert">{errors.checkInDate.message}</span>}
        </div>

        {bookingType === "overnight" && (
          <div className="bookingFormField">
            <label className="bookingFormLabel" htmlFor="checkOutDate">Check-out <span aria-hidden="true">*</span></label>
            <input
              id="checkOutDate"
              type="date"
              className="bookingFormInput"
              min={checkInDate || todayKey()}
              {...register("checkOutDate")}
            />
            {errors.checkOutDate && <span className="bookingFormError" role="alert">{errors.checkOutDate.message}</span>}
          </div>
        )}
      </div>

      {bookingType === "overnight" && roomId && (
        <div className="bookingFormField">
          <label className="bookingFormLabel">Pick your dates on the calendar</label>
          <RoomAvailabilityCalendar
            unavailableDates={availability?.unavailableDates ?? []}
            checkInDate={checkInDate}
            checkOutDate={checkOutDate}
            onSelectRange={(nextCheckIn, nextCheckOut) => {
              setValue("checkInDate", nextCheckIn, { shouldValidate: true });
              setValue("checkOutDate", nextCheckOut, { shouldValidate: true });
            }}
          />
          <p className="bookingFormHint">
            Red days are already booked or blocked. Click an available day to set check-in, then
            another to set check-out.
          </p>
        </div>
      )}

      {/* Guests */}
      <div className="bookingFormField">
        <label className="bookingFormLabel" htmlFor="numberOfGuests">Number of Guests <span aria-hidden="true">*</span></label>
        <input
          id="numberOfGuests"
          type="number"
          min={1}
          className="bookingFormInput"
          {...register("numberOfGuests")}
        />
        {errors.numberOfGuests && <span className="bookingFormError" role="alert">{errors.numberOfGuests.message}</span>}
      </div>

      {/* Guest info */}
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

      {/* Live quote panel */}
      {quoteError && <p className="bookingFormQuoteError" role="alert">{quoteError}</p>}
      {quote && !quoteError && (
        <div className="bookingQuotePanel">
          {/* Promo Date discount check (Section 5b) — bookingPricing.js
              already silently applies this to `quote.total` below, but
              without this banner the guest would never actually see
              THAT a promo applied, just a total that happens to look
              discounted with no explanation. promoNightsDiscounted is
              a count of how many of the selected date(s) matched an
              active promo, not the percent itself (different nights
              can carry different discount percentages), so this stays
              a plain confirmation rather than promising one exact %. */}
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
            Check-in {formatTime12Hour(quote.checkInTime)}{quote.nights > 0 ? ` · Check-out ${formatTime12Hour(quote.checkOutTime)}` : ""} · Free cancellation
            up to {quote.cancellationCutoffDays} day(s) before ({quote.refundPercentage}% refund).
          </p>
        </div>
      )}

      {submitError && <p className="bookingFormSubmitError" role="alert">{submitError}</p>}

      <button type="submit" className="bookingFormSubmit" disabled={isSubmitting || isFormValidating || Boolean(quoteError)}>
        {isSubmitting ? "Confirming…" : "Confirm Booking"}
      </button>
    </form>
  );
}