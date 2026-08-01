/**
 * FILE: app/superAdmin/(protected)/content/booking-confirmation-email/GenericEmailTemplateForm.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Renders one tab's editable copy (eyebrow, heading, intro, body) for
 * any of the 4 non-confirmation booking emails: Pending, Cancelled,
 * Auto-Cancelled, Rebooked. One reusable form — which template it's
 * editing is entirely driven by the `templateKey` + `template` props
 * from the parent.
 *
 * DATA FLOW:
 * 1. Parent passes the already-fetched `template` row for this tab
 * 2. Local form state is seeded from that row whenever the tab (or
 *    its data) changes
 * 3. "Save Changes" calls the parent's `onSave(templateKey, values)`
 */
"use client";

import { useEffect, useState } from "react";

const EMPTY_FORM = {
  eyebrowText: "",
  headingText: "",
  introMessage: "",
  bodyMessage: "",
};

/**
 * MERGE_TAG_HINTS
 * Which {{mergeTag}} placeholders are safe to use in this template's
 * copy — shown as a read-only reminder so the admin doesn't have to
 * guess (or accidentally invent a tag that never gets replaced).
 */
const MERGE_TAG_HINTS = {
  pending: ["{{guestName}}", "{{pendingHoldHours}}"],
  cancelled: ["{{guestName}}"],
  auto_cancelled: ["{{guestName}}"],
  rebooked: ["{{guestName}}"],
};

export default function GenericEmailTemplateForm({ templateKey, templateLabel, template, isLoading, onSave, showToast }) {
  const [formValues, setFormValues] = useState(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);

  // Seed local form state whenever this tab's row loads or changes —
  // after that, edits live only in formValues until "Save Changes".
  useEffect(() => {
    if (!template) return;
    setFormValues({
      eyebrowText: template.eyebrowText ?? "",
      headingText: template.headingText ?? "",
      introMessage: template.introMessage ?? "",
      bodyMessage: template.bodyMessage ?? "",
    });
  }, [template]);

  function handleFieldChange(field, value) {
    setFormValues((previous) => ({ ...previous, [field]: value }));
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      await onSave(templateKey, formValues);
      showToast(`✓ "${templateLabel}" email saved successfully.`, "success");
    } catch (submitError) {
      const message = submitError?.response?.data?.message || "We couldn't save this email template. Please try again.";
      showToast(`✕ ${message}`, "error");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <div className="bceSkeleton" />;
  }

  const mergeTags = MERGE_TAG_HINTS[templateKey] ?? [];

  return (
    <>
      <div className="bceHeaderRow">
        <p className="bceIntroNote">
          This is the &quot;{templateLabel}&quot; email a guest automatically receives during the booking lifecycle.
        </p>
        <button type="button" className="bceSaveButton" onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Saving…" : "Save Changes"}
        </button>
      </div>

      {mergeTags.length > 0 && (
        <div className="bceRulesNote">
          You can use these placeholders anywhere below — they&apos;re replaced automatically when the email is sent:{" "}
          {mergeTags.map((tag, index) => (
            <span key={tag}>
              <code>{tag}</code>
              {index < mergeTags.length - 1 ? ", " : ""}
            </span>
          ))}
        </div>
      )}

      <div className="bceFormPanel">
        <div className="bceFormField">
          <label htmlFor={`${templateKey}-eyebrowText`}>Eyebrow Label</label>
          <input
            id={`${templateKey}-eyebrowText`}
            type="text"
            placeholder="e.g. BOOKING PENDING"
            value={formValues.eyebrowText}
            onChange={(event) => handleFieldChange("eyebrowText", event.target.value)}
          />
        </div>
        <div className="bceFormField">
          <label htmlFor={`${templateKey}-headingText`}>Heading</label>
          <input
            id={`${templateKey}-headingText`}
            type="text"
            placeholder="e.g. Thanks, {{guestName}}!"
            value={formValues.headingText}
            onChange={(event) => handleFieldChange("headingText", event.target.value)}
          />
        </div>
        <div className="bceFormField">
          <label htmlFor={`${templateKey}-introMessage`}>Intro Message</label>
          <textarea
            id={`${templateKey}-introMessage`}
            rows={3}
            placeholder="Shown right after the heading, before the reference code and dates."
            value={formValues.introMessage}
            onChange={(event) => handleFieldChange("introMessage", event.target.value)}
          />
        </div>
        <div className="bceFormField">
          <label htmlFor={`${templateKey}-bodyMessage`}>Body Message</label>
          <textarea
            id={`${templateKey}-bodyMessage`}
            rows={5}
            placeholder="Shown below the reference code and dates. Leave a blank line between paragraphs."
            value={formValues.bodyMessage}
            onChange={(event) => handleFieldChange("bodyMessage", event.target.value)}
          />
        </div>
      </div>
    </>
  );
}
