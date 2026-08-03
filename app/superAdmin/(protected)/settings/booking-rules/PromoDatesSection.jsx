/**
 * FILE: app/superAdmin/(protected)/settings/booking-rules/PromoDatesSection.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Section 5b of Booking Rules & Configuration. Lets the admin tap one
 * or more specific calendar dates and assign a % discount to all of
 * them at once (e.g. "Aug 20, 21, 22 — 5% off, Overnight only"), then
 * lists every resulting entry with edit/delete per row.
 *
 * Deliberately separate from SeasonalPricingSection above: that one is
 * a per-room, date-RANGE, absolute price override; this one is
 * resort-wide, individual tapped dates, and a PERCENTAGE off whatever
 * the normal price would already be.
 *
 * Each promo may optionally be scoped to ONE specific Booking Rule set
 * (Section 5b's "Booking Rule Set" field) via PromoDate.bookingRuleId.
 * Left as "All rule sets" (null), a promo applies no matter which rule
 * set governs the date, same as before this field existed. Scoped to a
 * rule set, it only discounts a date while THAT rule set is the one
 * actually active for the booking's type — see the OR clause in
 * services/bookingPricing.js's promo lookup. `bookingRules` (the same
 * list BookingRulesListClient already fetched) is passed down from
 * there purely to populate this dropdown.
 *
 * DATA FLOW:
 * 1. usePromoDates() fetches all entries on mount
 * 2. "Add Promo Dates" opens AddPromoDatesModal — reuses
 *    RuleDatesCalendar (already used by BookingRuleForm.jsx's Section 1)
 *    for the tap-to-toggle multi-select, plus discount%/label/appliesTo
 *    fields; submitting calls createPromoDates() with the whole batch
 * 3. A row's "Edit" opens EditPromoDateModal (single date + fields);
 *    submitting calls updatePromoDate()
 * 4. "Delete" opens ConfirmationModal; confirming calls
 *    deletePromoDate() then shows a toast
 */
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { usePromoDates } from "@/hooks/usePromoDates";
import DataTable from "@/components/superAdmin/DataTable";
import ConfirmationModal from "@/components/superAdmin/ConfirmationModal";
import RuleDatesCalendar, { getDateRangeKeys } from "./RuleDatesCalendar";

const APPLIES_TO_OPTIONS = [
  { value: "all", label: "All booking types" },
  { value: "overnight", label: "Overnight only" },
  { value: "day_tour", label: "Day Tour only" },
  { value: "night_tour", label: "Night Tour only" },
];

function appliesToLabel(value) {
  return APPLIES_TO_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

/**
 * toDateInputValue
 * Formats an ISO date string as "YYYY-MM-DD" for a native date input
 * or for display — matches the same helper SeasonalPricingSection uses.
 */
function toDateInputValue(isoString) {
  return isoString ? isoString.slice(0, 10) : "";
}

const addPromoDatesSchema = z.object({
  discountPercent: z.coerce.number().min(0.01, "Discount must be more than 0.").max(100, "Discount can't exceed 100%."),
  label: z.string().optional(),
  appliesTo: z.enum(["all", "overnight", "day_tour", "night_tour"]),
  // Empty string means "unscoped — applies no matter which rule set is
  // active"; a non-empty value ties the promo to that one rule set.
  bookingRuleId: z.string().optional(),
});

function AddPromoDatesModal({ isOpen, bookingRules, onSubmit, onCancel }) {
  const [selectedDates, setSelectedDates] = useState(new Set());

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(addPromoDatesSchema),
    defaultValues: { discountPercent: 5, label: "", appliesTo: "all", bookingRuleId: "" },
  });

  // Anchor+range auto-fill — same click behavior as BookingRuleForm.jsx's
  // Section 1 calendar and the visitor-facing How-to-Book calendar:
  //   - No date selected yet -> selects just the clicked date (anchor).
  //   - Exactly one date already selected -> clicking the SAME date
  //     deselects it; clicking a DIFFERENT date fills in every date
  //     between the anchor and this click, inclusive.
  //   - A range is already selected -> clicking any date starts a
  //     fresh selection with just that date as the new anchor.
  function handleToggleDate(dateKey) {
    setSelectedDates((previousDates) => {
      if (previousDates.size === 0) {
        return new Set([dateKey]);
      }
      if (previousDates.size === 1) {
        const [anchorKey] = previousDates;
        return anchorKey === dateKey
          ? new Set()
          : new Set(getDateRangeKeys(anchorKey, dateKey));
      }
      return new Set([dateKey]);
    });
  }

  async function handleFormSubmit(data) {
    if (selectedDates.size === 0) return;
    await onSubmit({ ...data, dates: Array.from(selectedDates) });
    setSelectedDates(new Set());
    reset();
  }

  function handleCancel() {
    setSelectedDates(new Set());
    reset();
    onCancel();
  }

  if (!isOpen) return null;

  return (
    <div className="bookingRulesModalBackdrop" role="dialog" aria-modal="true">
      <div className="bookingRulesModalDialog">
        <h2 className="bookingRulesSectionTitle">Add Promo Dates</h2>

        <RuleDatesCalendar selectedDates={selectedDates} onToggleDate={handleToggleDate} />
        <p className="bookingRulesHint">
          {selectedDates.size === 0
            ? "Tap one or more dates above to apply a promo discount to them."
            : `${selectedDates.size} date(s) selected — set the discount below.`}
        </p>

        <form onSubmit={handleSubmit(handleFormSubmit)} className="bookingRulesForm">
          <div className="bookingRulesFormRow">
            <div className="bookingRulesFormField">
              <label htmlFor="promoDiscount">Discount % <span aria-hidden="true">*</span></label>
              <input id="promoDiscount" type="number" step="0.01" min="0.01" max="100" {...register("discountPercent")} />
              {errors.discountPercent && <span role="alert" className="bookingRulesFormError">{errors.discountPercent.message}</span>}
            </div>
            <div className="bookingRulesFormField">
              <label htmlFor="promoAppliesTo">Applies To <span aria-hidden="true">*</span></label>
              <select id="promoAppliesTo" {...register("appliesTo")}>
                {APPLIES_TO_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="bookingRulesFormField">
            <label htmlFor="promoBookingRuleId">Booking Rule Set</label>
            <select id="promoBookingRuleId" {...register("bookingRuleId")}>
              <option value="">All rule sets (applies no matter which rule set is active)</option>
              {bookingRules.map((rule) => (
                <option key={rule.id} value={rule.id}>{rule.name}</option>
              ))}
            </select>
            <p className="bookingRulesHint">
              Optional — tie this promo to one specific rule set so it only discounts a date while THAT rule set governs it.
            </p>
          </div>

          <div className="bookingRulesFormField">
            <label htmlFor="promoLabel">Label (optional)</label>
            <input id="promoLabel" type="text" placeholder="Anniversary Promo…" {...register("label")} />
            <p className="bookingRulesHint">For your own reference in this table only — visitors never see this.</p>
          </div>

          <div className="bookingRulesFormActions">
            <button type="button" className="bookingRulesButton bookingRulesButton--neutral" onClick={handleCancel}>
              Cancel
            </button>
            <button
              type="submit"
              className="bookingRulesButton bookingRulesButton--primary"
              disabled={isSubmitting || selectedDates.size === 0}
            >
              {isSubmitting ? "Saving…" : `Save ${selectedDates.size || ""} Date(s)`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const editPromoDateSchema = z.object({
  date: z.string().min(1, "Date is required."),
  discountPercent: z.coerce.number().min(0.01, "Discount must be more than 0.").max(100, "Discount can't exceed 100%."),
  label: z.string().optional(),
  appliesTo: z.enum(["all", "overnight", "day_tour", "night_tour"]),
  bookingRuleId: z.string().optional(),
});

function EditPromoDateModal({ isOpen, existingEntry, bookingRules, onSubmit, onCancel }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(editPromoDateSchema),
    defaultValues: {
      date: toDateInputValue(existingEntry?.date),
      discountPercent: existingEntry?.discountPercent ?? 5,
      label: existingEntry?.label ?? "",
      appliesTo: existingEntry?.appliesTo ?? "all",
      bookingRuleId: existingEntry?.bookingRuleId ?? "",
    },
  });

  if (!isOpen) return null;

  return (
    <div className="bookingRulesModalBackdrop" role="dialog" aria-modal="true">
      <div className="bookingRulesModalDialog">
        <h2 className="bookingRulesSectionTitle">Edit Promo Date</h2>

        <form onSubmit={handleSubmit(onSubmit)} className="bookingRulesForm">
          <div className="bookingRulesFormRow">
            <div className="bookingRulesFormField">
              <label htmlFor="editPromoDate">Date <span aria-hidden="true">*</span></label>
              <input id="editPromoDate" type="date" {...register("date")} />
              {errors.date && <span role="alert" className="bookingRulesFormError">{errors.date.message}</span>}
            </div>
            <div className="bookingRulesFormField">
              <label htmlFor="editPromoDiscount">Discount % <span aria-hidden="true">*</span></label>
              <input id="editPromoDiscount" type="number" step="0.01" min="0.01" max="100" {...register("discountPercent")} />
              {errors.discountPercent && <span role="alert" className="bookingRulesFormError">{errors.discountPercent.message}</span>}
            </div>
          </div>

          <div className="bookingRulesFormField">
            <label htmlFor="editPromoAppliesTo">Applies To <span aria-hidden="true">*</span></label>
            <select id="editPromoAppliesTo" {...register("appliesTo")}>
              {APPLIES_TO_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div className="bookingRulesFormField">
            <label htmlFor="editPromoBookingRuleId">Booking Rule Set</label>
            <select id="editPromoBookingRuleId" {...register("bookingRuleId")}>
              <option value="">All rule sets (applies no matter which rule set is active)</option>
              {bookingRules.map((rule) => (
                <option key={rule.id} value={rule.id}>{rule.name}</option>
              ))}
            </select>
            <p className="bookingRulesHint">
              Optional — tie this promo to one specific rule set so it only discounts a date while THAT rule set governs it.
            </p>
          </div>

          <div className="bookingRulesFormField">
            <label htmlFor="editPromoLabel">Label (optional)</label>
            <input id="editPromoLabel" type="text" {...register("label")} />
          </div>

          <div className="bookingRulesFormActions">
            <button type="button" className="bookingRulesButton bookingRulesButton--neutral" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="bookingRulesButton bookingRulesButton--primary" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function PromoDatesSection({ showToast, bookingRules }) {
  const { promoDates, isLoading, error, createPromoDates, updatePromoDate, deletePromoDate } = usePromoDates();

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null); // entry being edited, or null
  const [pendingDelete, setPendingDelete] = useState(null);

  async function handleAddSubmit(data) {
    try {
      await createPromoDates(data);
      showToast(`✓ ${data.dates.length} promo date(s) added successfully.`, "success");
      setIsAddModalOpen(false);
    } catch (submitError) {
      const message = submitError?.response?.data?.message || "We couldn't add these promo dates. Please try again.";
      showToast(`✕ ${message}`, "error");
    }
  }

  async function handleEditSubmit(data) {
    try {
      await updatePromoDate(editTarget.id, data);
      showToast("✓ Promo date updated successfully.", "success");
      setEditTarget(null);
    } catch (submitError) {
      const message = submitError?.response?.data?.message || "We couldn't save the changes. Please try again.";
      showToast(`✕ ${message}`, "error");
    }
  }

  async function handleConfirmDelete() {
    try {
      await deletePromoDate(pendingDelete.id);
      showToast("✓ Promo date deleted successfully.", "success");
    } catch {
      showToast("✕ Failed to delete promo date.", "error");
    } finally {
      setPendingDelete(null);
    }
  }

  const columns = [
    { key: "date", label: "Date" },
    { key: "discount", label: "Discount", align: "right", mono: true },
    { key: "appliesTo", label: "Applies To" },
    { key: "ruleSet", label: "Rule Set" },
    { key: "label", label: "Label" },
    { key: "actions", label: "Actions", align: "right" },
  ];

  const rows = promoDates.map((entry) => ({
    id: entry.id,
    date: toDateInputValue(entry.date),
    discount: `${Number(entry.discountPercent)}%`,
    appliesTo: appliesToLabel(entry.appliesTo),
    ruleSet: entry.bookingRule?.name ?? "All rule sets",
    label: entry.label || "—",
    actions: (
      <div className="bookingRulesRowActions">
        <button type="button" className="bookingRulesRowActionButton" onClick={() => setEditTarget(entry)}>
          Edit
        </button>
        <button
          type="button"
          className="bookingRulesRowActionButton bookingRulesRowActionButton--destructive"
          onClick={() => setPendingDelete(entry)}
        >
          Delete
        </button>
      </div>
    ),
  }));

  return (
    <section className="bookingRulesSection">
      <div className="bookingRulesSectionHeaderRow">
        <div>
          <h2 className="bookingRulesSectionTitle">Section 5b: Promo Dates</h2>
          <p className="bookingRulesSectionSubtitle">Tap specific calendar dates and give them a % discount — e.g. a long-weekend promo.</p>
        </div>
        <button type="button" className="bookingRulesAddButton" onClick={() => setIsAddModalOpen(true)}>
          + Add Promo Dates
        </button>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        isLoading={isLoading}
        error={error}
        emptyMessage="No promo dates set yet. Click “Add Promo Dates” to create the first one."
      />

      <AddPromoDatesModal
        isOpen={isAddModalOpen}
        bookingRules={bookingRules}
        onSubmit={handleAddSubmit}
        onCancel={() => setIsAddModalOpen(false)}
      />

      <EditPromoDateModal
        key={editTarget?.id ?? "closed"}
        isOpen={Boolean(editTarget)}
        existingEntry={editTarget}
        bookingRules={bookingRules}
        onSubmit={handleEditSubmit}
        onCancel={() => setEditTarget(null)}
      />

      <ConfirmationModal
        isOpen={Boolean(pendingDelete)}
        title="Delete Promo Date?"
        description={
          pendingDelete
            ? `Are you sure you want to delete the promo for ${toDateInputValue(pendingDelete.date)} (${Number(pendingDelete.discountPercent)}% off)? This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </section>
  );
}