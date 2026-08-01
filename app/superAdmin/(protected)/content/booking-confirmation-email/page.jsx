/**
 * FILE: app/superAdmin/(protected)/content/booking-confirmation-email/page.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Booking Confirmation Email content page. Lets the admin edit the
 * copy (eyebrow, heading, intro, resort rules heading/intro, closing,
 * footer) and attach gallery-style images for the automatic email
 * sent when a booking is confirmed (services/bookingConfirmationEmail.js).
 * Resort rules text itself is NOT edited here — it's pulled live from
 * Content > Policies > House Rules, shown read-only for reference.
 *
 * DATA FLOW:
 * 1. BookingConfirmationEmailClient (Client Component) owns the actual
 *    data fetching via useBookingConfirmationEmail() since the form
 *    needs live save/upload/refetch behavior
 * 2. This file is the thin Server Component route entry — no data
 *    fetching happens here directly
 */
import "./BookingConfirmationEmail.css";
import BookingConfirmationEmailClient from "./BookingConfirmationEmailClient";

export const metadata = {
  title: "Booking Confirmation Email | Super-Admin | your-private-resort",
};

export default function BookingConfirmationEmailPage() {
  return <BookingConfirmationEmailClient />;
}
