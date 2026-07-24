/**
 * FILE: app/superAdmin/(protected)/settings/booking-rules/SeasonDefinitionsPanel.jsx
 * ROLE: Super-admin only — protected by proxy.js auth guard
 *
 * PURPOSE:
 * Shown inside Section 5 (BookingRuleForm.jsx), right under the
 * "I-enable ang seasonal pricing" toggle. Displays the Philippine
 * Peak/Off season reference dates (seeded with the typical PH pattern
 * by services/seasonInfo.js on first load) and lets the admin add,
 * edit, or delete them — answering "parang kulang, walang nakalagay
 * yung mga peak/off season" by actually surfacing this info here
 * instead of a bare enable/disable checkbox with no context.
 *
 * IMPORTANT — these dates are informational only. They are a general
 * PH-wide reference for the admin's own planning and are NOT read by
 * services/bookingPricing.js. The toggle above controls a DIFFERENT
 * table: the per-room SeasonalPrice override list managed on the
 * Booking Rules list page (SeasonalPricingSection.jsx) — that's what
 * actually changes a room's nightly rate. Do not reintroduce a claim
 * that this panel drives pricing; that was the source of admin
 * confusion this fix addresses.
 *
 * DATA FLOW:
 * 1. useSeasonDefinitions() fetches all rows (server seeds PH
 *    defaults on first call if the table is empty)
 * 2. "Add Season" / a row's "Edit" opens the inline form in the
 *    matching mode; submitting calls create/updateSeasonDefinition
 * 3. "Delete" opens ConfirmationModal; confirming calls
 *    deleteSeasonDefinition() then shows a toast
 */
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useSeasonDefinitions } from "@/hooks/useSeasonDefinitions";
import ConfirmationModal from "@/components/superAdmin/ConfirmationModal";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const seasonDefinitionSchema = z.object({
  seasonType: z.enum(["peak", "off"]),
  label: z.string().min(1, "Label is required."),
  startMonth: z.coerce.number().min(1).max(12),
  startDay: z.coerce.number().min(1).max(31),
  endMonth: z.coerce.number().min(1).max(12),
  endDay: z.coerce.number().min(1).max(31),
});

function formatMonthDay(month, day) {
  return `${MONTH_NAMES[month - 1]} ${day}`;
}

function SeasonDefinitionRow({ season, onEdit, onDeleteRequest }) {
  return (
    <div className="seasonDefinitionRow">
      <span className={`seasonDefinitionBadge seasonDefinitionBadge--${season.seasonType}`}>
        {season.seasonType === "peak" ? "Peak" : "Off-Season"}
      </span>
      <span className="seasonDefinitionLabel">{season.label}</span>
      <span className="seasonDefinitionRange">
        {formatMonthDay(season.startMonth, season.startDay)} – {formatMonthDay(season.endMonth, season.endDay)}
      </span>
      <div className="bookingRulesRowActions">
        <button type="button" className="bookingRulesRowActionButton" onClick={() => onEdit(season)}>
          Edit
        </button>
        <button
          type="button"
          className="bookingRulesRowActionButton bookingRulesRowActionButton--destructive"
          onClick={() => onDeleteRequest(season)}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function SeasonDefinitionForm({ existingSeason, onSubmit, onCancel }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(seasonDefinitionSchema),
    defaultValues: {
      seasonType: existingSeason?.seasonType ?? "peak",
      label: existingSeason?.label ?? "",
      startMonth: existingSeason?.startMonth ?? 1,
      startDay: existingSeason?.startDay ?? 1,
      endMonth: existingSeason?.endMonth ?? 1,
      endDay: existingSeason?.endDay ?? 1,
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="bookingRulesForm seasonDefinitionForm">
      <div className="bookingRulesFormRow">
        <div className="bookingRulesFormField">
          <label htmlFor="seasonDefType">Type <span aria-hidden="true">*</span></label>
          <select id="seasonDefType" {...register("seasonType")}>
            <option value="peak">Peak Season</option>
            <option value="off">Off-Season</option>
          </select>
        </div>
        <div className="bookingRulesFormField">
          <label htmlFor="seasonDefLabel">Label <span aria-hidden="true">*</span></label>
          <input id="seasonDefLabel" type="text" placeholder="Summer Peak, Rainy Season…" {...register("label")} />
          {errors.label && <span role="alert" className="bookingRulesFormError">{errors.label.message}</span>}
        </div>
      </div>

      <div className="bookingRulesFormRow">
        <div className="bookingRulesFormField">
          <label htmlFor="seasonDefStartMonth">Start Month</label>
          <select id="seasonDefStartMonth" {...register("startMonth")}>
            {MONTH_NAMES.map((name, index) => (
              <option key={name} value={index + 1}>{name}</option>
            ))}
          </select>
        </div>
        <div className="bookingRulesFormField">
          <label htmlFor="seasonDefStartDay">Start Day</label>
          <input id="seasonDefStartDay" type="number" min="1" max="31" {...register("startDay")} />
        </div>
      </div>

      <div className="bookingRulesFormRow">
        <div className="bookingRulesFormField">
          <label htmlFor="seasonDefEndMonth">End Month</label>
          <select id="seasonDefEndMonth" {...register("endMonth")}>
            {MONTH_NAMES.map((name, index) => (
              <option key={name} value={index + 1}>{name}</option>
            ))}
          </select>
        </div>
        <div className="bookingRulesFormField">
          <label htmlFor="seasonDefEndDay">End Day</label>
          <input id="seasonDefEndDay" type="number" min="1" max="31" {...register("endDay")} />
        </div>
      </div>
      <p className="bookingRulesHint">
        End date can be earlier in the calendar than the start date — that&apos;s how a season crossing
        December into January (e.g. Dec 16 → Jan 15) is entered.
      </p>

      <div className="bookingRulesFormActions">
        <button type="button" className="bookingRulesButton bookingRulesButton--neutral" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="bookingRulesButton bookingRulesButton--primary" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

export default function SeasonDefinitionsPanel({ showToast }) {
  const {
    seasonDefinitions,
    isLoading,
    error,
    createSeasonDefinition,
    updateSeasonDefinition,
    deleteSeasonDefinition,
  } = useSeasonDefinitions();

  const [formTarget, setFormTarget] = useState(null); // null closed, {} = add, entry = edit
  const [pendingDelete, setPendingDelete] = useState(null);

  async function handleFormSubmit(data) {
    try {
      if (formTarget?.id) {
        await updateSeasonDefinition(formTarget.id, data);
        showToast(`✓ "${data.label}" updated successfully.`, "success");
      } else {
        await createSeasonDefinition(data);
        showToast(`✓ "${data.label}" added successfully.`, "success");
      }
      setFormTarget(null);
    } catch (submitError) {
      const message = submitError?.response?.data?.message || "We couldn't save this season. Please try again.";
      showToast(`✕ ${message}`, "error");
    }
  }

  async function handleConfirmDelete() {
    try {
      await deleteSeasonDefinition(pendingDelete.id);
      showToast(`✓ "${pendingDelete.label}" deleted successfully.`, "success");
    } catch {
      showToast("✕ Failed to delete season.", "error");
    } finally {
      setPendingDelete(null);
    }
  }

  return (
    <div className="seasonDefinitionsPanel">
      <div className="seasonDefinitionsPanelHeader">
        <h3 className="seasonDefinitionsPanelTitle">Current Philippine Seasons</h3>
        <button type="button" className="bookingRulesAddButton" onClick={() => setFormTarget({})}>
          + Add Season
        </button>
      </div>
      <p className="bookingRulesHint">
        Resort-wide reference dates (not tied to one room) for when it&apos;s generally Peak vs. Off-Season in
        the Philippines — for your own planning only, shown in the admin top bar. This does <strong>not</strong>{" "}
        change any room&apos;s price. To actually charge a different rate during a season, add a per-room
        entry under &quot;Seasonal Pricing&quot; on the Booking Rules list page, then make sure the toggle
        above is turned on.
      </p>

      {isLoading && <p className="bookingRulesHint">Loading seasons…</p>}
      {!isLoading && error && <p className="bookingRulesFormError">{error}</p>}
      {!isLoading && !error && seasonDefinitions.length === 0 && !formTarget && (
        <p className="bookingRulesHint">No seasons defined yet. Click &quot;Add Season&quot; to create one.</p>
      )}

      {!isLoading && !error && (
        <div className="seasonDefinitionsList">
          {seasonDefinitions.map((season) =>
            formTarget?.id === season.id ? (
              <SeasonDefinitionForm
                key={season.id}
                existingSeason={season}
                onSubmit={handleFormSubmit}
                onCancel={() => setFormTarget(null)}
              />
            ) : (
              <SeasonDefinitionRow
                key={season.id}
                season={season}
                onEdit={setFormTarget}
                onDeleteRequest={setPendingDelete}
              />
            )
          )}
        </div>
      )}

      {formTarget && !formTarget.id && (
        <SeasonDefinitionForm existingSeason={null} onSubmit={handleFormSubmit} onCancel={() => setFormTarget(null)} />
      )}

      <ConfirmationModal
        isOpen={Boolean(pendingDelete)}
        title="Delete Season?"
        description={pendingDelete ? `Are you sure you want to delete "${pendingDelete.label}"? This cannot be undone.` : ""}
        confirmLabel="Delete"
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
