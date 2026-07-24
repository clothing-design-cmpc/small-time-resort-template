/**
 * FILE: components/shared/ScheduledMaintenanceIcon.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Floating "heads-up" icon fixed to the bottom-left corner of the
 * screen. Replaces the old ScheduledMaintenanceNotice strip, which was
 * rendered as normal in-flow content directly under <Header /> — since
 * Header is position: fixed, that strip ended up tucked underneath it
 * instead of pushing it down, clipping the notice text. A floating
 * icon sidesteps the stacking issue entirely: it never competes for
 * space with the fixed header, and the message only shows when the
 * guest actively opens it, so it's still available but no longer
 * fighting the navbar for the same slice of the viewport.
 *
 * Deliberately paired with WalkInChatWidget (bottom-right) rather than
 * placed in the same corner — both are always-visible floating icons,
 * so they need their own corners to avoid overlapping each other.
 *
 * DATA FLOW:
 * 1. Icon renders on every visitor page via app/visitor/layout.jsx
 * 2. Click toggles a small popover showing the maintenance window text
 * 3. Clicking outside the popover, or pressing Escape, closes it again
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { getScheduledLockdownWindowLabel } from "@/services/scheduledLockdown";
import "./ScheduledMaintenanceIcon.css";

export default function ScheduledMaintenanceIcon() {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const popoverRef = useRef(null);
  const buttonRef = useRef(null);

  // Closes the popover on outside click or Escape — the same dismiss
  // pattern guests expect from any small popover/tooltip control
  useEffect(() => {
    if (!isPopoverOpen) return;

    function handleOutsideClick(event) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target) &&
        !buttonRef.current.contains(event.target)
      ) {
        setIsPopoverOpen(false);
      }
    }

    function handleEscapeKey(event) {
      if (event.key === "Escape") setIsPopoverOpen(false);
    }

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscapeKey);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscapeKey);
    };
  }, [isPopoverOpen]);

  function handleToggle() {
    setIsPopoverOpen((previousState) => !previousState);
  }

  return (
    <div className="scheduledMaintenanceIconWrapper">
      <button
        ref={buttonRef}
        type="button"
        className="scheduledMaintenanceIconButton"
        onClick={handleToggle}
        aria-label="Scheduled maintenance notice"
        aria-expanded={isPopoverOpen}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 3" />
        </svg>
      </button>

      {isPopoverOpen && (
        <div
          ref={popoverRef}
          className="scheduledMaintenancePopover"
          role="dialog"
          aria-label="Scheduled maintenance notice"
        >
          <p>
            This website undergoes brief nightly maintenance, {getScheduledLockdownWindowLabel()}, and may be
            temporarily unavailable during that time.
          </p>
        </div>
      )}
    </div>
  );
}
