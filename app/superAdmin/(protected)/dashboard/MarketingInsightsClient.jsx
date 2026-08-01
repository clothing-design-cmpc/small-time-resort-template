/**
 * FILE: app/superAdmin/(protected)/dashboard/MarketingInsightsClient.jsx
 * ROLE: Super-admin only — protected by proxy.js auth guard
 *
 * PURPOSE:
 * Dashboard section giving the owner marketing-relevant numbers built
 * from real Booking data (services/marketingInsights.js):
 *   - Recent Bookings — a live feed of the latest bookings, so the
 *     owner can see fresh activity without opening the Bookings page.
 *   - Top Performing Rooms — which rooms/villas to feature in ads or
 *     promo bundles this month, ranked by confirmed revenue.
 *   - Repeat Guest Rate — how much of the guest base is returning vs.
 *     first-time, a signal for whether loyalty/retention efforts are
 *     working.
 *
 * DATA FLOW:
 * 1. useMarketingInsights() fetches GET /api/admin/marketing-insights on mount
 * 2. Handles the three required states per Rule 25: loading skeleton,
 *    error with retry, and the real content
 * 3. Read-only — no mutations happen on this page
 */
"use client";

import { useEffect, useState } from "react";
import { useMarketingInsights } from "@/hooks/useMarketingInsights";
import DataTable from "@/components/superAdmin/DataTable";
import StatusBadge from "@/components/superAdmin/StatusBadge";

// Repeat Guest Rate table shows 10 guests per page, paginated entirely
// client-side (the full repeat-guest list already arrives in one
// response — no extra network round-trip needed per page).
const REPEAT_GUESTS_PAGE_SIZE = 10;

/**
 * formatDate
 * Short "Jul 24, 2026" style date for the Recent Bookings table —
 * consistent with how dates are shown elsewhere in the admin (Section
 * 6's Room Status cards use the same Asia/Manila-aware pattern).
 */
function formatDate(value) {
  return new Date(value).toLocaleDateString("en-US", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function MarketingInsightsClient() {
  const { data, isLoading, error, refetchInsights } = useMarketingInsights();

  // Current page for the Repeat Guest Rate table — resets to page 1
  // whenever a fresh repeat-guest list arrives (e.g. after Retry) so the
  // owner never lands on a now-out-of-range page.
  const [repeatGuestPage, setRepeatGuestPage] = useState(1);

  const bookingColumns = [
    { key: "guestName", label: "Guest" },
    { key: "roomName", label: "Room" },
    { key: "dates", label: "Check-in → Check-out" },
    { key: "amount", label: "Amount", align: "right" },
    { key: "status", label: "Status", align: "center" },
  ];

  const bookingRows = (data?.recentBookings ?? []).map((booking) => ({
    id: booking.id,
    guestName: booking.guestName,
    roomName: booking.roomName,
    dates: `${formatDate(booking.checkInDate)} → ${formatDate(booking.checkOutDate)}`,
    amount: `₱${booking.totalAmount.toLocaleString("en-US")}`,
    status: <StatusBadge status={booking.status} />,
  }));

  const topRooms = data?.topRooms ?? [];
  const maxRoomRevenue = Math.max(1, ...topRooms.map((room) => room.revenue));
  const repeatGuestRate = data?.repeatGuestRate;

  // --- Repeat Guest Rate table: name + total price, 10 per page ---
  const repeatGuestList = repeatGuestRate?.repeatGuests ?? [];
  const repeatGuestTotalPages = Math.max(1, Math.ceil(repeatGuestList.length / REPEAT_GUESTS_PAGE_SIZE));
  // Clamp in render (not just in the effect below) so a stale page number
  // can never slice past the end of a shorter, freshly-loaded list.
  const repeatGuestSafePage = Math.min(repeatGuestPage, repeatGuestTotalPages);
  const repeatGuestColumns = [
    { key: "guestName", label: "Guest" },
    { key: "price", label: "Total Price", align: "right" },
  ];
  const repeatGuestRows = repeatGuestList
    .slice((repeatGuestSafePage - 1) * REPEAT_GUESTS_PAGE_SIZE, repeatGuestSafePage * REPEAT_GUESTS_PAGE_SIZE)
    .map((guest) => ({
      id: guest.guestKey,
      guestName: guest.guestName,
      price: `₱${guest.totalAmount.toLocaleString("en-US")}`,
    }));

  // Auto-reset to page 1 whenever the underlying repeat-guest list
  // changes size (fresh fetch/refetch) — prevents landing on a blank
  // page 3 after a retry returns fewer guests than before.
  useEffect(() => {
    setRepeatGuestPage(1);
  }, [repeatGuestList.length]);

  return (
    <section className="marketingInsightsSection">
      <div className="dashboardHeaderRow">
        <span className="dashboardEyebrow">Marketing Insights</span>
        <h2 className="marketingInsightsTitle">Bookings &amp; Guest Trends</h2>
      </div>

      {error && (
        <div className="dataTableState dataTableState--error">
          <p>We couldn't load marketing insights.</p>
          <button type="button" className="bookingRulesButton bookingRulesButton--neutral" onClick={refetchInsights}>
            Retry
          </button>
        </div>
      )}

      {/* --- Repeat Guest Rate: summary stat + paginated name/price table --- */}
      {!error && (
        <div className="marketingInsightsPanel marketingInsightsPanel--fullWidth">
          <h3 className="analyticsPanelTitle">Repeat Guest Rate</h3>
          {isLoading ? (
            <div className="skeletonBlock marketingInsightsStatSkeleton" aria-hidden="true" />
          ) : (
            <>
              <span className="marketingInsightsStatValue">{repeatGuestRate?.repeatGuestPercent ?? 0}%</span>
              <p className="bookingRulesHint">
                {repeatGuestRate?.repeatGuestCount ?? 0} of {repeatGuestRate?.totalDistinctGuests ?? 0} guests have
                booked more than once.
              </p>
              <DataTable
                columns={repeatGuestColumns}
                rows={repeatGuestRows}
                emptyMessage="No repeat guests yet."
                page={repeatGuestSafePage}
                totalPages={repeatGuestTotalPages}
                totalCount={repeatGuestList.length}
                pageSize={REPEAT_GUESTS_PAGE_SIZE}
                onPageChange={setRepeatGuestPage}
              />
            </>
          )}
        </div>
      )}

      {!error && (
        <div className="marketingInsightsGrid">
          {/* --- Top Performing Rooms (current calendar month) --- */}
          <div className="marketingInsightsPanel">
            <h3 className="analyticsPanelTitle">Top Performing Rooms (This Month)</h3>
            {isLoading ? (
              <div className="skeletonBlock marketingInsightsListSkeleton" aria-hidden="true" />
            ) : topRooms.length === 0 ? (
              <p className="analyticsEmptyMessage">No confirmed bookings yet this month.</p>
            ) : (
              <ul className="marketingInsightsRoomList">
                {topRooms.map((room) => (
                  <li key={room.roomId} className="marketingInsightsRoomRow">
                    <div className="marketingInsightsRoomLabel">
                      <span>{room.roomName}</span>
                      <span className="bookingRulesHint">
                        {room.bookingCount} booking{room.bookingCount === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="marketingInsightsRoomBarTrack">
                      <div
                        className="marketingInsightsRoomBarFill"
                        style={{ width: `${(room.revenue / maxRoomRevenue) * 100}%` }}
                      />
                    </div>
                    <span className="marketingInsightsRoomRevenue">₱{room.revenue.toLocaleString("en-US")}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* --- Recent Bookings --- */}
      {!error && (
        <div className="marketingInsightsPanel marketingInsightsPanel--fullWidth">
          <h3 className="analyticsPanelTitle">Recent Bookings</h3>
          <DataTable
            columns={bookingColumns}
            rows={bookingRows}
            isLoading={isLoading}
            emptyMessage="No bookings yet."
          />
        </div>
      )}
    </section>
  );
}
