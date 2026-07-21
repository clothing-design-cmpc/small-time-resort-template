/**
 * FILE: app/superAdmin/(protected)/walkin-inquiries/page.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Lists every WalkInInquiry lead captured by the visitor site's
 * floating "Chat with us" widget — name, phone, IP, and when they
 * asked for a callback — so staff can call them and either mark the
 * lead "contacted" or, once a reservation is agreed, create the real
 * Booking on the Bookings page and mark this lead "converted".
 *
 * DATA FLOW:
 * 1. On mount, fetches GET /api/admin/walkin-inquiries
 * 2. Changing a row's status button calls PATCH
 *    /api/admin/walkin-inquiries/{id}, then refetches the list
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import StatusBadge from "@/components/superAdmin/StatusBadge";
import ToastStack from "@/components/superAdmin/shared/ToastStack";
import { useToast } from "@/components/superAdmin/shared/useToast";
import "./WalkInInquiries.css";

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function formatDateTime(isoString) {
  return DATE_TIME_FORMATTER.format(new Date(isoString));
}

// Each row's status button advances to the next stage in this order —
// clicking it moves the lead forward one step, never backward, so
// staff can't accidentally lose track of "already contacted" leads.
const NEXT_STATUS = { new: "contacted", contacted: "converted" };
const NEXT_STATUS_LABEL = { new: "Mark contacted", contacted: "Mark converted" };

export default function WalkInInquiriesPage() {
  const [inquiries, setInquiries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);
  // Tracks which row currently has a status update in flight, so only
  // that row's button shows a busy state instead of the whole table
  const [updatingInquiryId, setUpdatingInquiryId] = useState(null);

  const { toasts, showToast, dismissToast } = useToast();

  useEffect(() => {
    let isCancelled = false;

    async function fetchInquiries() {
      setIsLoading(true);
      setLoadError(null);

      try {
        const response = await fetch("/api/admin/walkin-inquiries");
        const result = await response.json();
        if (isCancelled) return;

        if (!result.success) {
          setLoadError(result.message || "Failed to load walk-in inquiries. Please try again.");
          return;
        }
        setInquiries(result.data.inquiries);
      } catch {
        if (!isCancelled) {
          setLoadError("We couldn't reach the server. Check your connection and try again.");
        }
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    }

    fetchInquiries();
    return () => {
      isCancelled = true;
    };
  }, [reloadToken]);

  const handleAdvanceStatus = useCallback(
    async (inquiry) => {
      const nextStatus = NEXT_STATUS[inquiry.status];
      if (!nextStatus) return;

      setUpdatingInquiryId(inquiry.id);
      try {
        const response = await fetch(`/api/admin/walkin-inquiries/${inquiry.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: nextStatus }),
        });
        const result = await response.json();

        if (!result.success) {
          showToast("✕ " + result.message, "error");
          return;
        }

        showToast(`✓ ${inquiry.guestName} marked as ${nextStatus}.`, "success");
        setReloadToken((token) => token + 1);
      } catch {
        showToast("✕ Network error — please try again.", "error");
      } finally {
        setUpdatingInquiryId(null);
      }
    },
    [showToast]
  );

  return (
    <section className="walkInInquiriesSection">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <div className="walkInInquiriesHeaderRow">
        <span className="walkInInquiriesEyebrow">Leads</span>
        <h1 className="walkInInquiriesTitle">Walk-in Inquiries</h1>
      </div>

      {isLoading && (
        <p className="walkInInquiriesLoadingText" aria-live="polite">Loading inquiries…</p>
      )}

      {!isLoading && loadError && (
        <div className="walkInInquiriesErrorState">
          <p className="walkInInquiriesErrorMessage">{loadError}</p>
          <button
            type="button"
            className="walkInInquiriesRetryButton"
            onClick={() => setReloadToken((token) => token + 1)}
          >
            Try again
          </button>
        </div>
      )}

      {!isLoading && !loadError && inquiries.length === 0 && (
        <div className="walkInInquiriesEmptyState">
          <p className="walkInInquiriesEmptyTitle">No inquiries yet.</p>
          <p className="walkInInquiriesEmptySubtitle">
            Callback requests from the visitor site's chat widget will show up here.
          </p>
        </div>
      )}

      {!isLoading && !loadError && inquiries.length > 0 && (
        <div className="walkInInquiriesTableWrap">
          <table className="walkInInquiriesTable">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>IP Address</th>
                <th>Requested</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {inquiries.map((inquiry) => (
                <tr key={inquiry.id}>
                  <td>{inquiry.guestName}</td>
                  <td>{inquiry.guestPhone}</td>
                  <td>{inquiry.ipAddress ?? "—"}</td>
                  <td>{formatDateTime(inquiry.createdAt)}</td>
                  <td>
                    <StatusBadge status={inquiry.status} />
                  </td>
                  <td className="walkInInquiriesActionsCell">
                    {NEXT_STATUS[inquiry.status] && (
                      <button
                        type="button"
                        className="walkInInquiriesAdvanceButton"
                        onClick={() => handleAdvanceStatus(inquiry)}
                        disabled={updatingInquiryId === inquiry.id}
                      >
                        {updatingInquiryId === inquiry.id ? "Updating…" : NEXT_STATUS_LABEL[inquiry.status]}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
