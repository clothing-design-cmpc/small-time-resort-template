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
 * 3. "Activate" calls activateBookingRule() directly (not destructive,
 *    no confirmation needed) then shows a toast
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
import BlackoutDatesSection from "./BlackoutDatesSection";

export default function BookingRulesListClient({ rooms }) {
  const router = useRouter();
  const { bookingRules, isLoading, error, deleteBookingRule, activateBookingRule } = useBookingRulesList();
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

  async function handleActivate(rule, event) {
    event.stopPropagation();
    try {
      await activateBookingRule(rule.id);
      showToast(`✓ "${rule.name}" is now the active rule set.`, "success");
    } catch (activateError) {
      const message = activateError?.response?.data?.message || "Failed to activate this rule set.";
      showToast(`✕ ${message}`, "error");
    }
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
    status: <StatusBadge status={rule.isActive ? "active" : "inactive"} />,
    updated: new Date(rule.updatedAt).toLocaleDateString(),
    actions: (
      <div className="bookingRulesRowActions">
        {!rule.isActive && (
          <button
            type="button"
            className="bookingRulesRowActionButton"
            onClick={(event) => handleActivate(rule, event)}
          >
            Activate
          </button>
        )}
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
        Create as many rule sets as you need (e.g. &quot;Regular Season&quot;, &quot;Holiday Rules&quot;) — only the one marked
        <strong> Active</strong> below is what guests and the pricing engine actually use.
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
      <BlackoutDatesSection showToast={showToast} />
    </section>
  );
}
