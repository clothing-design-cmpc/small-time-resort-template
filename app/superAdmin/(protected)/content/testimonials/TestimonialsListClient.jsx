/**
 * FILE: app/superAdmin/(protected)/content/testimonials/TestimonialsListClient.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Renders the Testimonials Management list: header + "Create New"
 * button, the DataTable of testimonials (guest, rating, quote
 * preview, featured state, actions), the create/edit modal, a delete
 * confirmation modal, and the toast stack (blueprint Page 5).
 *
 * DATA FLOW:
 * 1. useTestimonials() fetches all testimonials on mount
 * 2. Clicking "Create New" or a row's "Edit" opens TestimonialFormModal
 *    in the matching mode; submitting calls createTestimonial/updateTestimonial
 * 3. Clicking "Delete" opens ConfirmationModal; confirming calls
 *    deleteTestimonial() then shows a success/error toast
 */
"use client";

import { useState } from "react";
import Image from "next/image";
import { useTestimonials } from "@/hooks/useTestimonials";
import { useToast } from "@/app/superAdmin/shared/useToast";
import ToastStack from "@/app/superAdmin/shared/ToastStack";
import DataTable from "@/components/superAdmin/DataTable";
import StatusBadge from "@/components/superAdmin/StatusBadge";
import ConfirmationModal from "@/components/superAdmin/ConfirmationModal";
import TestimonialFormModal from "./TestimonialFormModal";

/**
 * getInitials
 * Same fallback treatment as the visitor-facing card — keeps the admin
 * list and the public Guest Reviews section visually consistent so a
 * testimonial always looks like the same "thing" in both places.
 */
function getInitials(name) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
}

/**
 * PhotoCell
 * Small circular thumbnail (or initials fallback) so the admin can see
 * at a glance which reviews have a guest photo attached, without
 * opening each row's Edit modal.
 */
function PhotoCell({ guestPhoto, guestName }) {
  if (guestPhoto) {
    return (
      <Image
        src={guestPhoto}
        alt={guestName}
        width={32}
        height={32}
        className="testimonialsPhotoCellImage"
      />
    );
  }
  return (
    <span className="testimonialsPhotoCellInitials" aria-hidden="true">
      {getInitials(guestName)}
    </span>
  );
}

/**
 * StarRatingCell
 * Renders a 1-5 star rating as filled/empty star characters so the
 * list gives an at-a-glance sense of the review without opening it.
 */
function StarRatingCell({ rating }) {
  return (
    <span className="testimonialsStarCell" aria-label={`${rating} out of 5 stars`}>
      {"★".repeat(rating)}
      <span className="testimonialsStarCell--empty">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

export default function TestimonialsListClient() {
  const { testimonials, isLoading, error, createTestimonial, updateTestimonial, deleteTestimonial } = useTestimonials();
  const { toasts, showToast, dismissToast } = useToast();

  // null = modal closed. {} = create mode. A testimonial object = edit mode.
  const [formModalTarget, setFormModalTarget] = useState(null);
  const [testimonialPendingDelete, setTestimonialPendingDelete] = useState(null);

  async function handleFormSubmit(data) {
    try {
      if (formModalTarget?.id) {
        await updateTestimonial(formModalTarget.id, data);
        showToast("✓ Testimonial updated successfully.", "success");
      } else {
        await createTestimonial(data);
        showToast(`✓ Testimonial from "${data.guestName}" added successfully.`, "success");
      }
      setFormModalTarget(null);
    } catch (submitError) {
      const message = submitError?.response?.data?.message || "We couldn't save this testimonial. Please try again.";
      showToast(`✕ ${message}`, "error");
    }
  }

  async function handleConfirmDelete() {
    try {
      await deleteTestimonial(testimonialPendingDelete.id);
      showToast(`✓ Testimonial from "${testimonialPendingDelete.guestName}" deleted successfully.`, "success");
    } catch {
      showToast("✕ Failed to delete testimonial.", "error");
    } finally {
      setTestimonialPendingDelete(null);
    }
  }

  /**
   * handleApprove
   * Approves a visitor-submitted review (isApproved: false -> true) so
   * it becomes eligible to show on the public site. Admin-created rows
   * are already isApproved: true by default and never show this action.
   */
  async function handleApprove(testimonial) {
    try {
      await updateTestimonial(testimonial.id, { isApproved: true });
      showToast(`✓ Approved the review from "${testimonial.guestName}".`, "success");
    } catch (approveError) {
      const message = approveError?.response?.data?.message || "Failed to approve this review.";
      showToast(`✕ ${message}`, "error");
    }
  }

  const columns = [
    { key: "photo", label: "Photo", align: "center" },
    { key: "guestName", label: "Guest Name" },
    { key: "rating", label: "Rating", align: "center" },
    { key: "quote", label: "Quote" },
    { key: "source", label: "Source", align: "center" },
    { key: "status", label: "Status", align: "center" },
    { key: "featured", label: "Featured?", align: "center" },
    { key: "actions", label: "Actions", align: "right" },
  ];

  const rows = testimonials.map((testimonial) => {
    // Visitor-submitted reviews start unapproved (Rule: never trust
    // public writes to go live without moderation) — flagged here so
    // the admin can spot and act on them at a glance.
    const isPending = testimonial.source === "visitor" && !testimonial.isApproved;

    return {
      id: testimonial.id,
      photo: <PhotoCell guestPhoto={testimonial.guestPhoto} guestName={testimonial.guestName} />,
      guestName: testimonial.guestName,
      rating: <StarRatingCell rating={testimonial.rating} />,
      quote: (
        <span className="testimonialsQuotePreview">
          {testimonial.quote.length > 80 ? `${testimonial.quote.slice(0, 80)}…` : testimonial.quote}
        </span>
      ),
      source: (
        <span className="testimonialsSourceCell">
          {testimonial.source === "visitor" ? "Guest" : "Admin"}
        </span>
      ),
      status: isPending ? <StatusBadge status="pending_review" /> : <StatusBadge status="approved_review" />,
      featured: <StatusBadge status={testimonial.isFeatured ? "active" : "suspended"} />,
      actions: (
        <div className="testimonialsRowActions">
          {isPending && (
            <button
              type="button"
              className="testimonialsRowActionButton testimonialsRowActionButton--approve"
              onClick={(event) => {
                event.stopPropagation();
                handleApprove(testimonial);
              }}
            >
              Approve
            </button>
          )}
          <button
            type="button"
            className="testimonialsRowActionButton"
            onClick={(event) => {
              event.stopPropagation();
              setFormModalTarget(testimonial);
            }}
          >
            Edit
          </button>
          <button
            type="button"
            className="testimonialsRowActionButton testimonialsRowActionButton--destructive"
            onClick={(event) => {
              event.stopPropagation();
              setTestimonialPendingDelete(testimonial);
            }}
          >
            Delete
          </button>
        </div>
      ),
    };
  });

  return (
    <section className="testimonialsSection">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <div className="testimonialsHeaderRow">
        <div>
          <span className="testimonialsEyebrow">Content Management</span>
          <h1 className="testimonialsTitle">Testimonials</h1>
        </div>
        <button type="button" className="testimonialsAddButton" onClick={() => setFormModalTarget({})}>
          + Create New
        </button>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        isLoading={isLoading}
        error={error}
        emptyMessage="No testimonials yet. Click “Create New” to add the first guest review."
      />

      <TestimonialFormModal
        key={formModalTarget?.id ?? (formModalTarget ? "new" : "closed")}
        isOpen={Boolean(formModalTarget)}
        existingTestimonial={formModalTarget?.id ? formModalTarget : null}
        onSubmit={handleFormSubmit}
        onCancel={() => setFormModalTarget(null)}
      />

      <ConfirmationModal
        isOpen={Boolean(testimonialPendingDelete)}
        title="Delete Testimonial?"
        description={
          testimonialPendingDelete
            ? `Are you sure you want to delete the testimonial from "${testimonialPendingDelete.guestName}"? This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        onConfirm={handleConfirmDelete}
        onCancel={() => setTestimonialPendingDelete(null)}
      />
    </section>
  );
}
