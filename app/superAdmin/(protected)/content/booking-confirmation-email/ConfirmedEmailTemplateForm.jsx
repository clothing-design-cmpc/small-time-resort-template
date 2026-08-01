/**
 * FILE: app/superAdmin/(protected)/content/booking-confirmation-email/ConfirmedEmailTemplateForm.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Renders the "Booking Confirmed" tab of the Email Templates editor:
 * copy fields (eyebrow, heading, intro, resort rules heading/intro,
 * closing, footer), a read-only reminder that the actual resort rules
 * text is edited under Content > Policies, and a gallery-style image
 * manager (add, reorder, caption, delete) — everything
 * services/bookingConfirmationEmail.js reads when a booking is
 * confirmed. Extracted unchanged from the original single-page
 * component so this tab keeps its existing data model and images.
 *
 * DATA FLOW:
 * 1. useBookingConfirmationEmail() fetches the singleton row + images
 * 2. Local form state is seeded from that row once it loads
 * 3. "Save Changes" persists the copy fields; image actions call their
 *    own mutations directly and refresh independently
 */
"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useBookingConfirmationEmail } from "@/hooks/useBookingConfirmationEmail";
import ConfirmationModal from "@/components/superAdmin/ConfirmationModal";
import BookingConfirmationEmailImageModal from "./BookingConfirmationEmailImageModal";

const EMPTY_FORM = {
  eyebrowText: "",
  headingText: "",
  introMessage: "",
  resortRulesHeading: "",
  resortRulesIntro: "",
  closingMessage: "",
  footerNote: "",
};

export default function ConfirmedEmailTemplateForm({ showToast }) {
  const {
    settings,
    isLoading,
    error,
    saveEmailContent,
    addEmailImage,
    updateEmailImage,
    deleteEmailImage,
    moveEmailImage,
  } = useBookingConfirmationEmail();

  const [formValues, setFormValues] = useState(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [imagePendingDelete, setImagePendingDelete] = useState(null);

  // Seed local form state once the singleton row loads — after that,
  // edits live only in formValues until "Save Changes" is pressed.
  useEffect(() => {
    if (!settings) return;
    setFormValues({
      eyebrowText: settings.eyebrowText ?? "",
      headingText: settings.headingText ?? "",
      introMessage: settings.introMessage ?? "",
      resortRulesHeading: settings.resortRulesHeading ?? "",
      resortRulesIntro: settings.resortRulesIntro ?? "",
      closingMessage: settings.closingMessage ?? "",
      footerNote: settings.footerNote ?? "",
    });
  }, [settings]);

  function handleFieldChange(field, value) {
    setFormValues((previous) => ({ ...previous, [field]: value }));
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      await saveEmailContent(formValues);
      showToast("✓ Booking confirmation email saved successfully.", "success");
    } catch (submitError) {
      const message = submitError?.response?.data?.message || "We couldn't save the email settings. Please try again.";
      showToast(`✕ ${message}`, "error");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAddImage(payload) {
    try {
      await addEmailImage(payload);
      showToast("✓ Image added to the confirmation email.", "success");
      setIsImageModalOpen(false);
    } catch (submitError) {
      const message = submitError?.response?.data?.message || "We couldn't add this image. Please try again.";
      showToast(`✕ ${message}`, "error");
      throw submitError; // let the modal keep its own error state too
    }
  }

  async function handleMove(image, direction) {
    try {
      await moveEmailImage(image, direction);
    } catch {
      showToast("✕ Couldn't reorder this image. Please try again.", "error");
    }
  }

  async function handleCaptionBlur(image, newCaption) {
    if ((image.caption ?? "") === newCaption) return; // No change — skip the request.
    try {
      await updateEmailImage(image.id, { caption: newCaption || null });
    } catch {
      showToast("✕ Couldn't save the caption. Please try again.", "error");
    }
  }

  async function handleConfirmDelete() {
    try {
      await deleteEmailImage(imagePendingDelete.id);
      showToast("✓ Image deleted from the confirmation email.", "success");
    } catch {
      showToast("✕ Failed to delete this image.", "error");
    } finally {
      setImagePendingDelete(null);
    }
  }

  if (isLoading) {
    return <div className="bceSkeleton" />;
  }

  if (error) {
    return (
      <div className="bceStateMessage bceStateMessage--error">
        We couldn&apos;t load the email settings. Please try again.
      </div>
    );
  }

  const images = [...(settings?.images ?? [])].sort((a, b) => a.displayOrder - b.displayOrder);

  return (
    <>
      <div className="bceHeaderRow">
        <p className="bceIntroNote">
          This is the email a guest automatically receives the moment their booking is confirmed. It includes their
          booking details, any images added below, and the resort rules.
        </p>
        <button type="button" className="bceSaveButton" onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Saving…" : "Save Changes"}
        </button>
      </div>

      <div className="bceFormPanel">
        <div className="bceFormField">
          <label htmlFor="eyebrowText">Eyebrow Label</label>
          <input
            id="eyebrowText"
            type="text"
            placeholder="e.g. BOOKING CONFIRMED"
            value={formValues.eyebrowText}
            onChange={(event) => handleFieldChange("eyebrowText", event.target.value)}
          />
        </div>
        <div className="bceFormField">
          <label htmlFor="headingText">Heading</label>
          <input
            id="headingText"
            type="text"
            placeholder="e.g. Your stay is confirmed!"
            value={formValues.headingText}
            onChange={(event) => handleFieldChange("headingText", event.target.value)}
          />
        </div>
        <div className="bceFormField">
          <label htmlFor="introMessage">Intro Message</label>
          <textarea
            id="introMessage"
            rows={3}
            placeholder="Shown right after the guest's name, before the booking details box."
            value={formValues.introMessage}
            onChange={(event) => handleFieldChange("introMessage", event.target.value)}
          />
        </div>
        <div className="bceFormField">
          <label htmlFor="resortRulesHeading">Resort Rules Section Heading</label>
          <input
            id="resortRulesHeading"
            type="text"
            placeholder="e.g. Resort Rules"
            value={formValues.resortRulesHeading}
            onChange={(event) => handleFieldChange("resortRulesHeading", event.target.value)}
          />
        </div>
        <div className="bceFormField">
          <label htmlFor="resortRulesIntro">Resort Rules Section Intro</label>
          <textarea
            id="resortRulesIntro"
            rows={2}
            placeholder="e.g. Please review these rules before your stay:"
            value={formValues.resortRulesIntro}
            onChange={(event) => handleFieldChange("resortRulesIntro", event.target.value)}
          />
        </div>
        <div className="bceRulesNote">
          The rules themselves are edited under{" "}
          <Link href="/superAdmin/content/policies">Content &gt; Policies &gt; House Rules</Link> — this page only
          controls the heading and intro shown above them in the email.
        </div>
        <div className="bceFormField">
          <label htmlFor="closingMessage">Closing Message</label>
          <textarea
            id="closingMessage"
            rows={2}
            placeholder="Shown after the resort rules, before the invoice/directions links."
            value={formValues.closingMessage}
            onChange={(event) => handleFieldChange("closingMessage", event.target.value)}
          />
        </div>
        <div className="bceFormField">
          <label htmlFor="footerNote">Footer Note (optional)</label>
          <textarea
            id="footerNote"
            rows={2}
            placeholder="Shown at the very bottom of the email."
            value={formValues.footerNote}
            onChange={(event) => handleFieldChange("footerNote", event.target.value)}
          />
        </div>
      </div>

      <div className="bceImagesHeaderRow">
        <h2 className="bceSectionHeading">Images</h2>
        <button type="button" className="bceAddButton" onClick={() => setIsImageModalOpen(true)}>
          + Add Image
        </button>
      </div>

      {images.length === 0 ? (
        <div className="bceEmptyState">No images added yet. Uploaded images appear in the order shown here.</div>
      ) : (
        <div className="bceImageGrid">
          {images.map((image, index) => (
            <div key={image.id} className="bceImageCard">
              <div className="bceImageThumbWrapper">
                <Image src={image.imageUrl} alt={image.caption || ""} fill sizes="200px" style={{ objectFit: "cover" }} />
              </div>
              <input
                type="text"
                className="bceImageCaptionInput"
                placeholder="Caption (optional)"
                defaultValue={image.caption ?? ""}
                onBlur={(event) => handleCaptionBlur(image, event.target.value.trim())}
              />
              <div className="bceImageCardActions">
                <button
                  type="button"
                  className="bceIconButton"
                  onClick={() => handleMove(image, "up")}
                  disabled={index === 0}
                  aria-label="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="bceIconButton"
                  onClick={() => handleMove(image, "down")}
                  disabled={index === images.length - 1}
                  aria-label="Move down"
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="bceIconButton bceIconButton--danger"
                  onClick={() => setImagePendingDelete(image)}
                  aria-label="Delete"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <BookingConfirmationEmailImageModal
        isOpen={isImageModalOpen}
        onSubmit={handleAddImage}
        onCancel={() => setIsImageModalOpen(false)}
      />

      <ConfirmationModal
        isOpen={Boolean(imagePendingDelete)}
        title="Delete Image?"
        description={`Are you sure you want to delete this image from the confirmation email? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleConfirmDelete}
        onCancel={() => setImagePendingDelete(null)}
      />
    </>
  );
}
