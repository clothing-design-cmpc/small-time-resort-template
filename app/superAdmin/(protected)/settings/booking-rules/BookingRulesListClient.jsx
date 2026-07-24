/**
 * FILE: app/superAdmin/(protected)/settings/booking-rules/BookingRulesListClient.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Renders the Booking Rules list: header + "Create Rule Set" button,
 * the DataTable of rule sets (name + which one is active + actions), a
 * delete confirmation modal, and the Seasonal Pricing / Blackout Dates
 * sub-sections underneath (those are per-room and independent of which
 * rule set is active).
 *
 * DATA FLOW:
 * 1. useBookingRulesList() fetches every rule set on mount
 * 2. Clicking a row navigates to that rule set's edit page
 * 3. Clicking a row's Status badge calls toggleBookingRuleActive()
 *    directly (not destructive, no confirmation needed) then shows a
 *    toast — every rule set is independent, toggling one never
 *    affects any other row
 * 4. "Delete" opens ConfirmationModal; confirming calls
 *    deleteBookingRule() then shows a success/error toast — the API
 *    itself blocks deleting the active rule or the last one remaining
 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useBookingRulesList } from "@/hooks/useBookingRulesList";
import { useToast } from "@/app/superAdmin/shared/useToast";
import ToastStack from "@/app/superAdmin/shared/ToastStack";
import DataTable from "@/components/superAdmin/DataTable";
import StatusBadge from "@/components/superAdmin/StatusBadge";
import ConfirmationModal from "@/components/superAdmin/ConfirmationModal";
import SeasonalPricingSection from "./SeasonalPricingSection";
import RoomStatusSection from "./RoomStatusSection";

export default function BookingRulesListClient({ rooms }) {
  const router = useRouter();
  const { bookingRules, isLoading, error, deleteBookingRule, toggleBookingRuleActive } = useBookingRulesList();
  const { toasts, showToast, dismissToast } = useToast();

  // Tracks which rule set is pending deletion so ConfirmationModal knows
  // what to show and what to delete when confirmed.
  const [rulePendingDelete, setRulePendingDelete] = useState(null);

  async function handleConfirmDelete() {
    try {
      await deleteBookingRule(rulePendingDelete.id);
      showToast(`✓ "${rulePendingDelete.name}" deleted successfully.`, "success");
    } catch (deleteError) {
      const message = deleteError?.response?.data?.message || "Failed to delete booking rule set.";
      showToast(`✕ ${message}`, "error");
    } finally {
      setRulePendingDelete(null);
    }
  }

  async function handleToggleActive(rule, event) {
    event.stopPropagation();
    const nextIsActive = !rule.isActive;
    try {
      await toggleBookingRuleActive(rule.id, nextIsActive);
      showToast(`✓ "${rule.name}" is now ${nextIsActive ? "Active" : "Inactive"}.`, "success");
    } catch (toggleError) {
      const message = toggleError?.response?.data?.message || "Failed to update this rule set's status.";
      showToast(`✕ ${message}`, "error");
    }
  }

  /**
   * describeActiveTypes
   * Each booking type (Overnight / Day Tour / Night Tour) has its own
   * independent active slot now — a plain "Active" badge alone doesn't
   * tell the admin WHICH type(s) this row is serving, which is exactly
   * what caused the "bakit may Inactive pa" confusion. Lists only the
   * types this row actually allows AND is currently active for.
   */
  function describeActiveTypes(rule) {
    const labels = [];
    if (rule.isActive && rule.allowOvernightStay) labels.push("Overnight");
    if (rule.isActive && rule.allowDayTour) labels.push("Day Tour");
    if (rule.isActive && rule.allowNightTour) labels.push("Night Tour");
    return labels.join(" + ");
  }

  const columns = [
    { key: "name", label: "Rule Set Name" },
    { key: "status", label: "Status", align: "center" },
    { key: "updated", label: "Last Updated" },
    { key: "actions", label: "Actions", align: "right" },
  ];

  const rows = bookingRules.map((rule) => ({
    id: rule.id,
    name: rule.name,
    status: (
      <div className="bookingRulesStatusCell">
        <button
          type="button"
          className="bookingRulesStatusToggle"
          onClick={(event) => handleToggleActive(rule, event)}
          title={rule.isActive ? "Click to set Inactive" : "Click to set Active"}
        >
          <StatusBadge status={rule.isActive ? "active" : "inactive"} />
        </button>
        {rule.isActive && (
          <span className="bookingRulesActiveForLabel">Active for: {describeActiveTypes(rule) || "—"}</span>
        )}
      </div>
    ),
    updated: new Date(rule.updatedAt).toLocaleDateString(),
    actions: (
      <div className="bookingRulesRowActions">
        <Link
          href={`/superAdmin/settings/booking-rules/${rule.id}`}
          className="bookingRulesRowActionButton"
          onClick={(event) => event.stopPropagation()}
        >
          Edit
        </Link>
        <button
          type="button"
          className="bookingRulesRowActionButton bookingRulesRowActionButton--destructive"
          onClick={(event) => {
            event.stopPropagation();
            setRulePendingDelete(rule);
          }}
          disabled={rule.isActive}
        >
          Delete
        </button>
      </div>
    ),
  }));

  return (
    <section className="bookingRulesPage">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <div className="bookingRulesListHeaderRow">
        <div className="bookingRulesHeaderRow">
          <span className="bookingRulesEyebrow">Settings</span>
          <h1 className="bookingRulesPageTitle">Booking Rules &amp; Configuration</h1>
        </div>
        <Link href="/superAdmin/settings/booking-rules/new" className="bookingRulesAddButton">
          + Create Rule Set
        </Link>
      </div>

      <p className="bookingRulesSectionSubtitle">
        Create as many rule sets as you need (e.g. &quot;Regular Season&quot;, &quot;Holiday Rules&quot;). Every rule set
        starts <strong>Active</strong> — click a rule set&apos;s Status badge to toggle it Active/Inactive any
        time. Toggling one rule set never affects any other.
      </p>

      <DataTable
        columns={columns}
        rows={rows}
        isLoading={isLoading}
        error={error}
        emptyMessage="No booking rule sets yet. Click “Create Rule Set” to add the first one."
        onRowClick={(row) => router.push(`/superAdmin/settings/booking-rules/${row.id}`)}
      />

      <ConfirmationModal
        isOpen={Boolean(rulePendingDelete)}
        title="Delete Booking Rule Set?"
        description={
          rulePendingDelete
            ? `Are you sure you want to delete "${rulePendingDelete.name}"? This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        onConfirm={handleConfirmDelete}
        onCancel={() => setRulePendingDelete(null)}
      />

      <SeasonalPricingSection rooms={rooms} showToast={showToast} />
      <RoomStatusSection showToast={showToast} />
    </section>
  );
}
