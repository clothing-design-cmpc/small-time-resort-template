/**
 * FILE: app/superAdmin/(protected)/dashboard/MaintenanceToggleClient.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Dashboard card that turns the site-wide maintenance banner on/off
 * (Task 4: breach response). Since this affects every guest on the
 * visitor site the moment it's flipped, both directions go through
 * ConfirmationModal — never a single-click toggle.
 *
 * DATA FLOW:
 * 1. On mount, GET /api/superAdmin/settings/maintenance loads the
 *    current flag + message
 * 2. Clicking the toggle opens ConfirmationModal describing exactly
 *    what will happen
 * 3. Confirming PATCHes the same route, shows a toast, and updates
 *    the card's own state — no page reload needed
 */
"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import ConfirmationModal from "@/components/superAdmin/ConfirmationModal";
import StatusBadge from "@/components/superAdmin/StatusBadge";
import { useToast } from "@/app/superAdmin/shared/useToast";
import ToastStack from "@/app/superAdmin/shared/ToastStack";

const DEFAULT_MESSAGE =
  "We've detected a security issue and taken the site offline as a precaution. We're sorry for the inconvenience — please check back shortly.";

export default function MaintenanceToggleClient() {
  const { toasts, showToast, dismissToast } = useToast();
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [isLoading, setIsLoading] = useState(true);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  // Loads the current flag once on mount so the card never shows a
  // stale/default state if maintenance mode was already turned on.
  useEffect(() => {
    axios
      .get("/api/superAdmin/settings/maintenance")
      .then((response) => {
        setMaintenanceMode(response.data.data.maintenanceMode);
        setMessage(response.data.data.maintenanceMessage || DEFAULT_MESSAGE);
      })
      .catch(() => showToast("✕ Couldn't load maintenance status.", "error"))
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleConfirmToggle() {
    const nextValue = !maintenanceMode;
    try {
      await axios.patch("/api/superAdmin/settings/maintenance", {
        maintenanceMode: nextValue,
        maintenanceMessage: message,
      });
      setMaintenanceMode(nextValue);
      showToast(
        nextValue ? "✓ Maintenance mode is now ON. Guests will see the banner." : "✓ Maintenance mode is now OFF.",
        "success"
      );
    } catch {
      showToast("✕ Failed to update maintenance mode.", "error");
    } finally {
      setIsConfirmOpen(false);
    }
  }

  return (
    <div className="maintenanceToggleCard">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <div className="maintenanceToggleHeader">
        <div>
          <h2 className="maintenanceToggleTitle">Maintenance Mode</h2>
          <p className="maintenanceToggleSubtitle">
            Shows a site-wide banner to every guest and is meant for breach response or planned downtime.
          </p>
        </div>
        <StatusBadge status={maintenanceMode ? "suspended" : "active"} />
      </div>

      <label className="maintenanceToggleField" htmlFor="maintenanceMessage">
        Banner message
        <textarea
          id="maintenanceMessage"
          rows={2}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          disabled={isLoading}
        />
      </label>

      <button
        type="button"
        className={maintenanceMode ? "maintenanceToggleButton maintenanceToggleButton--off" : "maintenanceToggleButton maintenanceToggleButton--on"}
        onClick={() => setIsConfirmOpen(true)}
        disabled={isLoading}
      >
        {maintenanceMode ? "Turn Maintenance Mode OFF" : "Turn Maintenance Mode ON"}
      </button>

      <ConfirmationModal
        isOpen={isConfirmOpen}
        title={maintenanceMode ? "Turn Off Maintenance Mode?" : "Turn On Maintenance Mode?"}
        description={
          maintenanceMode
            ? "Guests will stop seeing the maintenance banner and the site will look normal again."
            : "Every visitor page will immediately show a maintenance banner to all guests. Use this during a security incident or planned downtime."
        }
        confirmLabel={maintenanceMode ? "Turn Off" : "Turn On"}
        onConfirm={handleConfirmToggle}
        onCancel={() => setIsConfirmOpen(false)}
      />
    </div>
  );
}
