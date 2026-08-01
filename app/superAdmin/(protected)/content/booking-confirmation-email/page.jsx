/**
 * FILE: app/superAdmin/(protected)/content/booking-confirmation-email/page.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Booking Email Templates content page — tabbed editor for every
 * automatic booking-lifecycle email: Pending, Confirmed, Cancelled,
 * Auto-Cancelled, and Rebooked. The Confirmed tab additionally
 * manages gallery-style images (services/bookingConfirmationEmail.js);
 * the other 4 tabs edit eyebrow/heading/intro/body copy only
 * (services/bookingEmailTemplates.js). Resort rules text itself is
 * NOT edited here — it's pulled live from Content > Policies > House
 * Rules, shown read-only for reference on the Confirmed tab.
 *
 * DATA FLOW:
 * 1. BookingConfirmationEmailClient (Client Component) owns tab state
 *    and the shared toast instance
 * 2. Each tab's form owns its own data fetching (useBookingConfirmationEmail
 *    for Confirmed, useBookingEmailTemplates for the other 4) since
 *    they need live save/refetch behavior
 * 3. This file is the thin Server Component route entry — no data
 *    fetching happens here directly
 */
import "./BookingConfirmationEmail.css";
import BookingConfirmationEmailClient from "./BookingConfirmationEmailClient";

export const metadata = {
  title: "Booking Email Templates | Super-Admin | your-private-resort",
};

export default function BookingConfirmationEmailPage() {
  return <BookingConfirmationEmailClient />;
}
