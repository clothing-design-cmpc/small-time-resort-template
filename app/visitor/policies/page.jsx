/**
 * FILE: app/visitor/policies/page.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Displays all resort policies in a single scannable page:
 * booking policies, refund & cancellation policies, house rules,
 * check-in/check-out times, and privacy terms.
 *
 * DATA FLOW:
 * 1. Visitor navigates to /visitor/policies (via footer or header)
 * 2. Server Component reads the singleton SystemSettings row directly
 *    via Prisma (no separate public API route needed — this is a
 *    Server Component, never a "use client" file) — the same row the
 *    super-admin edits under Content > Policies (blueprint Page 8)
 * 3. Whichever sections the admin has actually filled in (houseRules,
 *    cancellationPolicy, termsOfService, privacyPolicy) render that
 *    saved text; any section still empty falls back to sensible
 *    default copy so the page is never blank before an admin opens
 *    the Policies editor for the first time
 * 4. Anchor links in the sticky sidebar jump to each policy section
 */
import "./Policies.css";
import { prisma } from "@/services/prisma";

export const metadata = {
  title: "Policies | Villa Azure Resort",
  description: "Booking policies, refund and cancellation terms, house rules, and privacy policy for Villa Azure Resort.",
};

/* ─── Data ─────────────────────────────────────────────────────── */

const bookingPolicies = [
  {
    id: "bp-1",
    title: "Reservation & Confirmation",
    body: "All reservations are considered tentative until a booking deposit has been received and a written confirmation has been issued by Villa Azure Resort. Verbal or online inquiries do not constitute a confirmed booking.",
  },
  {
    id: "bp-2",
    title: "Booking Deposit",
    body: "A deposit of 50% of the total accommodation rate is required to secure your reservation. The remaining balance must be settled in full at least 7 days before your check-in date. Reservations not settled within this window may be released without notice.",
  },
  {
    id: "bp-3",
    title: "Check-In & Check-Out",
    body: "Standard check-in is at 2:00 PM and check-out is at 12:00 PM (noon). Early check-in and late check-out are subject to availability and may incur an additional charge. Requests must be made at least 48 hours in advance.",
  },
  {
    id: "bp-4",
    title: "Guest Occupancy",
    body: "Each villa has a stated maximum occupancy. Exceeding the stated guest count without prior approval is not permitted and may result in the booking being cancelled without a refund. Day visitors must be declared and approved by the front desk.",
  },
  {
    id: "bp-5",
    title: "Identification",
    body: "All guests are required to present a valid government-issued photo ID upon check-in. This applies to all adult guests staying overnight. Copies may be retained for resort security records.",
  },
  {
    id: "bp-6",
    title: "Rates & Inclusions",
    body: "Published rates are per villa per night and include standard amenities as listed per room type. Rates do not include optional add-ons such as spa services, extra meals, or activity packages unless explicitly stated in the booking confirmation.",
  },
];

const refundPolicies = [
  {
    id: "rp-1",
    title: "Cancellation — More Than 14 Days Before Check-In",
    body: "Cancellations made more than 14 days before the scheduled check-in date are eligible for a full refund of the booking deposit, minus a ₱500 processing fee. Refunds are processed within 7–10 business days via the original payment method.",
  },
  {
    id: "rp-2",
    title: "Cancellation — 7 to 14 Days Before Check-In",
    body: "Cancellations made between 7 and 14 days before check-in are eligible for a 50% refund of the total booking deposit. The remaining 50% is non-refundable and will be retained as a cancellation fee.",
  },
  {
    id: "rp-3",
    title: "Cancellation — Less Than 7 Days Before Check-In",
    body: "Cancellations made within 7 days of the check-in date are non-refundable. The full booking deposit will be forfeited. We strongly recommend travel insurance for all guests.",
  },
  {
    id: "rp-4",
    title: "No-Show Policy",
    body: "Guests who do not arrive on the scheduled check-in date and have not contacted the resort in advance will be treated as a no-show. No-show reservations are non-refundable. The full booking amount will be charged.",
  },
  {
    id: "rp-5",
    title: "Early Departure",
    body: "No refund will be issued for unused nights resulting from an early departure once a stay has commenced. This includes departures due to personal reasons, changes in travel plans, or dissatisfaction not attributable to Villa Azure Resort.",
  },
  {
    id: "rp-6",
    title: "Force Majeure & Resort-Initiated Changes",
    body: "In the event of a cancellation initiated by Villa Azure Resort due to unforeseen circumstances beyond our control (severe weather, natural disaster, or facility emergency), guests will be offered either a full refund or a complimentary rebooking at their preference.",
  },
  {
    id: "rp-7",
    title: "Rebooking",
    body: "Guests who wish to rebook rather than cancel may do so once per reservation at no additional charge, provided the request is made at least 7 days before the original check-in date and the new dates are within 6 months of the original reservation.",
  },
];

const houseRules = [
  "Quiet hours are observed from 10:00 PM to 7:00 AM. Loud music, gatherings, and any noise that may disturb other guests is not permitted during this period.",
  "Smoking is prohibited inside all villas and enclosed areas. Designated outdoor smoking areas are available — please ask the front desk.",
  "Pets are not allowed on resort premises without prior written approval. Approved pets must remain within the guest's villa at all times.",
  "All resort equipment and villa furnishings must be treated with care. Guests will be charged for any deliberate or negligent damage to property.",
  "Outside food and beverages are permitted in private villas. Outside food is not allowed in the resort's restaurant or common dining areas.",
  "The resort reserves the right to refuse service or remove any guest whose behavior is disruptive, threatening, or in violation of these house rules — without a refund.",
  "Children under 12 must be supervised by an adult at all times near the pool, beach, and other water features.",
  "Single-use plastics are discouraged on resort grounds. Guests are encouraged to use the refillable water stations provided in each villa.",
];

/* ─── Component ─────────────────────────────────────────────────── */

/**
 * renderTextBlock
 * Splits an admin-saved plain-text policy field on blank lines into
 * paragraphs. Returns null for an empty/whitespace-only value so the
 * caller can fall back to default static copy instead of rendering
 * nothing.
 */
function renderTextBlock(text) {
  if (!text || !text.trim()) return null;
  return text
    .trim()
    .split(/\n{2,}/)
    .map((paragraph, index) => (
      <p key={index} className="policiesItemBody" style={index > 0 ? { marginTop: "1rem" } : undefined}>
        {paragraph}
      </p>
    ));
}

export default async function PoliciesPage() {
  // Read-only fetch of the singleton settings row the super-admin edits
  // under Content > Policies. Fails safe to null so this public page
  // never 500s just because the row hasn't been created yet.
  const settings = await prisma.systemSettings.findUnique({ where: { id: "singleton" } }).catch(() => null);

  const houseRulesText = renderTextBlock(settings?.houseRules);
  const bookingPoliciesText = renderTextBlock(settings?.bookingPolicies);
  const cancellationPolicyText = renderTextBlock(settings?.cancellationPolicy);
  const termsOfServiceText = renderTextBlock(settings?.termsOfService);
  const privacyPolicyText = renderTextBlock(settings?.privacyPolicy);

  // Check-in/check-out — admin-editable under Content > Policies, with
  // the original static copy as the fallback default.
  const checkInTime = settings?.checkInTime?.trim() || "2:00 PM";
  const checkOutTime = settings?.checkOutTime?.trim() || "12:00 PM";
  const checkInNote =
    settings?.checkInNote?.trim() ||
    "Early check-in subject to availability. Request at least 48 hours in advance.";
  const checkOutNote =
    settings?.checkOutNote?.trim() ||
    "Late check-out subject to availability. Additional half-day charge may apply.";

  return (
    <main className="policiesMain">
      {/* Page header */}
      <section className="policiesHero">
        <div className="policiesHeroContainer">
          <span className="policiesEyebrow">Guest Information</span>
          <h1 className="policiesTitle">Resort Policies</h1>
          <p className="policiesSubtitle">
            Please read these policies carefully before making a reservation.
            They exist to protect both our guests and our team.
          </p>
        </div>
      </section>

      {/* Body — two-column layout on desktop */}
      <section className="policiesBody">
        <div className="policiesBodyContainer">

          {/* Sticky sidebar nav — desktop only */}
          <aside className="policiesSidebar" aria-label="Jump to section">
            <span className="policiesSidebarLabel">On This Page</span>
            <ul className="policiesSidebarList">
              <li><a href="#booking-policies" className="policiesSidebarLink">Booking Policies</a></li>
              <li><a href="#refund-policies" className="policiesSidebarLink">Refund & Cancellation</a></li>
              <li><a href="#house-rules" className="policiesSidebarLink">House Rules</a></li>
              {termsOfServiceText && (
                <li><a href="#terms" className="policiesSidebarLink">Terms &amp; Conditions</a></li>
              )}
              <li><a href="#checkin-times" className="policiesSidebarLink">Check-In / Check-Out</a></li>
              <li><a href="#privacy" className="policiesSidebarLink">Privacy Policy</a></li>
            </ul>
          </aside>

          {/* Main content */}
          <div className="policiesContent">

            {/* ── Booking Policies ── */}
            <section id="booking-policies" className="policiesSection">
              <h2 className="policiesSectionTitle">Booking Policies</h2>
              <p className="policiesSectionIntro">
                The following terms apply to all reservations made directly with Villa Azure Resort, whether by phone, email, or online inquiry.
              </p>
              {bookingPoliciesText ? (
                <div className="policiesItem">{bookingPoliciesText}</div>
              ) : (
                <ul className="policiesList">
                  {bookingPolicies.map((item) => (
                    <li key={item.id} className="policiesItem">
                      <h3 className="policiesItemTitle">{item.title}</h3>
                      <p className="policiesItemBody">{item.body}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <div className="policiesDivider" />

            {/* ── Refund & Cancellation Policies ── */}
            <section id="refund-policies" className="policiesSection">
              <h2 className="policiesSectionTitle">Refund &amp; Cancellation Policy</h2>
              <p className="policiesSectionIntro">
                We understand that plans change. The following refund schedule applies to all cancellations. We recommend travel insurance for peace of mind.
              </p>

              {/* Summary table */}
              <div className="policiesRefundTable">
                <div className="policiesRefundTableHeader">
                  <span>Cancellation Timing</span>
                  <span>Refund Amount</span>
                </div>
                <div className="policiesRefundTableRow">
                  <span>More than 14 days before check-in</span>
                  <span className="policiesRefundBadge policiesRefundBadgeGreen">Full refund (less ₱500 fee)</span>
                </div>
                <div className="policiesRefundTableRow">
                  <span>7 – 14 days before check-in</span>
                  <span className="policiesRefundBadge policiesRefundBadgeAmber">50% refund</span>
                </div>
                <div className="policiesRefundTableRow">
                  <span>Less than 7 days before check-in</span>
                  <span className="policiesRefundBadge policiesRefundBadgeRed">Non-refundable</span>
                </div>
                <div className="policiesRefundTableRow">
                  <span>No-show</span>
                  <span className="policiesRefundBadge policiesRefundBadgeRed">Non-refundable</span>
                </div>
              </div>

              {cancellationPolicyText ? (
                <div className="policiesItem">{cancellationPolicyText}</div>
              ) : (
                <ul className="policiesList">
                  {refundPolicies.map((item) => (
                    <li key={item.id} className="policiesItem">
                      <h3 className="policiesItemTitle">{item.title}</h3>
                      <p className="policiesItemBody">{item.body}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <div className="policiesDivider" />

            {/* ── House Rules ── */}
            <section id="house-rules" className="policiesSection">
              <h2 className="policiesSectionTitle">House Rules</h2>
              <p className="policiesSectionIntro">
                These rules apply to all guests and visitors. Compliance ensures a peaceful experience for everyone on the property.
              </p>
              {houseRulesText ? (
                <div className="policiesItem">{houseRulesText}</div>
              ) : (
                <ul className="policiesRulesList">
                  {houseRules.map((rule, index) => (
                    <li key={index} className="policiesRulesItem">
                      <span className="policiesRulesNumber">{String(index + 1).padStart(2, "0")}</span>
                      <p className="policiesRulesText">{rule}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <div className="policiesDivider" />

            {/* ── Terms & Conditions — admin-editable only, no static
                 fallback content, so the section is simply omitted
                 until an admin fills it in under Content > Policies ── */}
            {termsOfServiceText && (
              <>
                <section id="terms" className="policiesSection">
                  <h2 className="policiesSectionTitle">Terms &amp; Conditions</h2>
                  {termsOfServiceText}
                </section>
                <div className="policiesDivider" />
              </>
            )}

            {/* ── Check-In / Check-Out ── */}
            <section id="checkin-times" className="policiesSection">
              <h2 className="policiesSectionTitle">Check-In &amp; Check-Out Times</h2>
              <div className="policiesTimesGrid">
                <div className="policiesTimeCard">
                  <span className="policiesTimeLabel">Check-In</span>
                  <span className="policiesTimeValue">{checkInTime}</span>
                  <span className="policiesTimeNote">{checkInNote}</span>
                </div>
                <div className="policiesTimeCard">
                  <span className="policiesTimeLabel">Check-Out</span>
                  <span className="policiesTimeValue">{checkOutTime}</span>
                  <span className="policiesTimeNote">{checkOutNote}</span>
                </div>
              </div>
            </section>

            <div className="policiesDivider" />

            {/* ── Privacy Policy ── */}
            <section id="privacy" className="policiesSection">
              <h2 className="policiesSectionTitle">Privacy Policy</h2>
              {privacyPolicyText ?? (
                <>
                  <p className="policiesItemBody">
                    Villa Azure Resort collects personal information (name, contact details, and identification) solely for the purpose of processing reservations, managing your stay, and maintaining resort security. We do not sell, rent, or share your personal data with third parties for marketing purposes.
                  </p>
                  <p className="policiesItemBody" style={{ marginTop: "1rem" }}>
                    Guest information is stored securely and retained only for as long as required by applicable law or operational necessity. You may request access to or deletion of your personal data at any time by contacting us directly at <a href="mailto:hello@villaazure.com" className="policiesInlineLink">hello@villaazure.com</a>.
                  </p>
                  <p className="policiesItemBody" style={{ marginTop: "1rem" }}>
                    For account security, Villa Azure Resort also records limited technical information whenever you or our staff sign in to a resort account — including IP address, device/browser type, and an approximate geographic location (city and country, derived from IP address, never precise GPS coordinates). This information is used solely to detect suspicious sign-ins, such as an account being accessed from an unexpected location or an unrecognized device, and is retained only for a limited period before being automatically and permanently deleted.
                  </p>
                  <p className="policiesItemBody" style={{ marginTop: "1rem" }}>
                    By making a reservation with Villa Azure Resort, you consent to the collection and use of your information as described above. This policy was last updated in July 2026.
                  </p>
                </>
              )}
            </section>

            {/* Contact prompt */}
            <div className="policiesContactPrompt">
              <p className="policiesContactPromptText">
                Questions about our policies? We&apos;re happy to clarify anything before you book.
              </p>
              <a href="/visitor/contact" className="policiesContactPromptLink">
                Contact Us →
              </a>
            </div>

          </div>
        </div>
      </section>
    </main>
  );
}
