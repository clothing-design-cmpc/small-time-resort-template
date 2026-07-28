/**
 * FILE: components/shared/ResortLocationWidgetClient.jsx
 * ROLE: Visitor — public, no auth required. Browser-only interactive
 *       piece — always rendered via ResortLocationWidget.jsx (the
 *       Server Component that fetches the address/coordinates),
 *       never imported directly anywhere else.
 *
 * PURPOSE:
 * Renders the floating "Location" icon (stacked directly above
 * ManageBookingWidget's "Cancellation" icon) and, on click, a modal
 * showing the resort's exact address alongside the same pin map used
 * in the footer (ResortLocationMap), so a guest can see exactly where
 * the resort is without hunting for it on the page.
 *
 * DATA FLOW:
 * 1. Receives address/latitude/longitude/resortName as props from
 *    ResortLocationWidget.jsx
 * 2. Hovering/focusing the floating button shows a "Location" tooltip
 *    (same pattern as ManageBookingWidget's "Cancellation" tooltip)
 * 3. Clicking the button opens a centered modal with the address text
 *    and the ResortLocationMap pin map, centered on the same
 *    coordinates the footer map uses
 */
"use client";

import { useState } from "react";
import ResortLocationMap from "./ResortLocationMap";
import "./ResortLocationWidget.css";

export default function ResortLocationWidgetClient({ address, latitude, longitude, resortName }) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  function handleOpen() {
    setIsModalOpen(true);
  }

  function handleClose() {
    setIsModalOpen(false);
  }

  return (
    <>
      {/* Floating icon — stacked directly above ManageBookingWidget's button, min 44x44 tap target */}
      <button
        type="button"
        className="resortLocationButton"
        onClick={handleOpen}
        aria-label="View the resort's exact location"
        title="Location"
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
        <span className="resortLocationTooltip" role="tooltip">Location</span>
      </button>

      {isModalOpen && (
        <div className="resortLocationBackdrop" role="presentation" onClick={handleClose}>
          <div
            className="resortLocationModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="resortLocationTitle"
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" className="resortLocationCloseButton" onClick={handleClose} aria-label="Close">
              ×
            </button>

            <h2 id="resortLocationTitle" className="resortLocationTitle">Our Location</h2>
            <p className="resortLocationAddress">{address}</p>

            <ResortLocationMap latitude={latitude} longitude={longitude} resortName={resortName} />
          </div>
        </div>
      )}
    </>
  );
}
