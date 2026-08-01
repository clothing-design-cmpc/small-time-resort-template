/**
 * FILE: app/superAdmin/(protected)/content/booking-confirmation-email/EmailTemplateTabs.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Renders the tab bar that switches which of the 5 booking-lifecycle
 * email templates is being edited (Pending, Confirmed, Cancelled,
 * Auto-Cancelled, Rebooked). Purely presentational — the parent
 * (BookingConfirmationEmailClient) owns which tab is active.
 */
"use client";

export default function EmailTemplateTabs({ tabs, activeKey, onSelect }) {
  return (
    <div className="bceTabBar" role="tablist" aria-label="Booking email templates">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={tab.key === activeKey}
          className={`bceTab${tab.key === activeKey ? " bceTab--active" : ""}`}
          onClick={() => onSelect(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
