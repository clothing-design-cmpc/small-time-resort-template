/**
 * FILE: app/superAdmin/(protected)/content/booking-confirmation-email/BookingConfirmationEmailClient.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Renders the Email Templates editor: a tab per booking-lifecycle
 * email (Pending, Confirmed, Cancelled, Auto-Cancelled, Rebooked).
 * The "Confirmed" tab keeps its existing dedicated data model +
 * images gallery (ConfirmedEmailTemplateForm); the other 4 tabs share
 * one reusable form (GenericEmailTemplateForm) backed by
 * useBookingEmailTemplates(). One shared ToastStack/toast instance is
 * owned here and passed down to whichever tab is active (Rule 22.4).
 *
 * DATA FLOW:
 * 1. useBookingEmailTemplates() fetches the 4 generic templates once
 * 2. activeTabKey (local state) decides which tab's form renders
 * 3. Each tab's form owns its own field state and calls back up to
 *    save — the Confirmed tab via its own hook, the other 4 via
 *    saveTemplate() from useBookingEmailTemplates()
 */
"use client";

import { useState } from "react";
import { useBookingEmailTemplates } from "@/hooks/useBookingEmailTemplates";
import { useToast } from "@/app/superAdmin/shared/useToast";
import ToastStack from "@/app/superAdmin/shared/ToastStack";
import EmailTemplateTabs from "./EmailTemplateTabs";
import ConfirmedEmailTemplateForm from "./ConfirmedEmailTemplateForm";
import GenericEmailTemplateForm from "./GenericEmailTemplateForm";
import { TEMPLATE_LABELS } from "@/services/bookingEmailTemplates";
import "./BookingConfirmationEmail.css";

// Tab order shown to the admin — mirrors the actual booking lifecycle
// (pending → confirmed, or pending → cancelled/auto-cancelled), with
// rebooked last since it can happen at any point after confirmation.
const TABS = [
  { key: "pending", label: TEMPLATE_LABELS.pending },
  { key: "confirmed", label: "Booking Confirmed" },
  { key: "cancelled", label: TEMPLATE_LABELS.cancelled },
  { key: "auto_cancelled", label: TEMPLATE_LABELS.auto_cancelled },
  { key: "rebooked", label: TEMPLATE_LABELS.rebooked },
];

export default function BookingConfirmationEmailClient() {
  const { templates, isLoading, error, saveTemplate } = useBookingEmailTemplates();
  const { toasts, showToast, dismissToast } = useToast();
  const [activeTabKey, setActiveTabKey] = useState("pending");

  return (
    <section className="bceSection">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <div>
        <span className="bceEyebrow">Content Management</span>
        <h1 className="bceTitle">Booking Email Templates</h1>
      </div>

      <p className="bceIntroNote">
        These are the automatic emails a guest receives at each stage of their booking — from the initial request
        through confirmation, cancellation, or a reschedule. Pick a tab to edit that email&apos;s design and text.
      </p>

      <EmailTemplateTabs tabs={TABS} activeKey={activeTabKey} onSelect={setActiveTabKey} />

      {activeTabKey === "confirmed" ? (
        <ConfirmedEmailTemplateForm showToast={showToast} />
      ) : error ? (
        <div className="bceStateMessage bceStateMessage--error">
          We couldn&apos;t load the email templates. Please try again.
        </div>
      ) : (
        <GenericEmailTemplateForm
          key={activeTabKey}
          templateKey={activeTabKey}
          templateLabel={TEMPLATE_LABELS[activeTabKey]}
          template={templates?.[activeTabKey]}
          isLoading={isLoading}
          onSave={saveTemplate}
          showToast={showToast}
        />
      )}
    </section>
  );
}
