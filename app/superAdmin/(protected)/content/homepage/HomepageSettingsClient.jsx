/**
 * FILE: app/superAdmin/(protected)/content/homepage/HomepageSettingsClient.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Renders the Homepage Customization form: Hero Section, Featured
 * Rooms picker, Testimonials Section, CTA Section, and SEO &
 * Metadata — all saved together with one "Save All Changes" button
 * (blueprint Page 9).
 *
 * DATA FLOW:
 * 1. useHomepageSettings() fetches the singleton settings row; useRooms()
 *    fetches the room list so the admin can pick up to 3 featured rooms
 * 2. Local form state is seeded from the settings row once it loads
 * 3. Hero/OG image files are uploaded to R2 immediately on file
 *    selection, so "Save All Changes" always sends a ready url/key
 */
"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import Image from "next/image";
import { useHomepageSettings } from "@/hooks/useHomepageSettings";
import { useRooms } from "@/hooks/useRooms";
import { useToast } from "@/app/superAdmin/shared/useToast";
import ToastStack from "@/app/superAdmin/shared/ToastStack";
import "./Homepage.css";

const EMPTY_FORM = {
  siteTitle: "",
  brandAccentColor: "",
  heroTagline: "",
  heroImageUrl: null,
  heroImageKey: null,
  featuredRoomIds: [],
  aboutDifferentiator1Title: "",
  aboutDifferentiator1Body: "",
  aboutDifferentiator2Title: "",
  aboutDifferentiator2Body: "",
  aboutDifferentiator3Title: "",
  aboutDifferentiator3Body: "",
  testimonialsSectionEnabled: true,
  testimonialsSectionCount: 3,
  testimonialsFeaturedOnly: true,
  ctaSectionHeading: "",
  ctaSectionSubtext: "",
  ctaButtonText: "",
  ctaSectionVisible: true,
  siteDescription: "",
  ogImageUrl: null,
  ogImageKey: null,
};

export default function HomepageSettingsClient() {
  const { homepageSettings, isLoading, error, saveHomepageSettings } = useHomepageSettings();
  const { rooms } = useRooms();
  const { toasts, showToast, dismissToast } = useToast();

  const [formValues, setFormValues] = useState(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingHero, setIsUploadingHero] = useState(false);
  const [isUploadingOg, setIsUploadingOg] = useState(false);

  // Seed local form state once the singleton row loads.
  useEffect(() => {
    if (!homepageSettings) return;
    setFormValues({
      siteTitle: homepageSettings.siteTitle ?? "",
      brandAccentColor: homepageSettings.brandAccentColor ?? "#3f7d52",
      heroTagline: homepageSettings.heroTagline ?? "",
      heroImageUrl: homepageSettings.heroImageUrl ?? null,
      heroImageKey: homepageSettings.heroImageKey ?? null,
      featuredRoomIds: homepageSettings.featuredRoomIds ?? [],
      aboutDifferentiator1Title: homepageSettings.aboutDifferentiator1Title ?? "",
      aboutDifferentiator1Body: homepageSettings.aboutDifferentiator1Body ?? "",
      aboutDifferentiator2Title: homepageSettings.aboutDifferentiator2Title ?? "",
      aboutDifferentiator2Body: homepageSettings.aboutDifferentiator2Body ?? "",
      aboutDifferentiator3Title: homepageSettings.aboutDifferentiator3Title ?? "",
      aboutDifferentiator3Body: homepageSettings.aboutDifferentiator3Body ?? "",
      testimonialsSectionEnabled: homepageSettings.testimonialsSectionEnabled ?? true,
      testimonialsSectionCount: homepageSettings.testimonialsSectionCount ?? 3,
      testimonialsFeaturedOnly: homepageSettings.testimonialsFeaturedOnly ?? true,
      ctaSectionHeading: homepageSettings.ctaSectionHeading ?? "",
      ctaSectionSubtext: homepageSettings.ctaSectionSubtext ?? "",
      ctaButtonText: homepageSettings.ctaButtonText ?? "",
      ctaSectionVisible: homepageSettings.ctaSectionVisible ?? true,
      siteDescription: homepageSettings.siteDescription ?? "",
      ogImageUrl: homepageSettings.ogImageUrl ?? null,
      ogImageKey: homepageSettings.ogImageKey ?? null,
    });
  }, [homepageSettings]);

  function handleFieldChange(field, value) {
    setFormValues((previous) => ({ ...previous, [field]: value }));
  }

  /**
   * handleFeaturedRoomToggle
   * Adds or removes a room from the featured selection. Blocks adding
   * a 4th room — the homepage only ever shows 3 — with an inline toast
   * instead of silently ignoring the click.
   */
  function handleFeaturedRoomToggle(roomId) {
    setFormValues((previous) => {
      const isSelected = previous.featuredRoomIds.includes(roomId);
      if (isSelected) {
        return { ...previous, featuredRoomIds: previous.featuredRoomIds.filter((id) => id !== roomId) };
      }
      if (previous.featuredRoomIds.length >= 3) {
        showToast("✕ You can only feature up to 3 rooms. Remove one first.", "error");
        return previous;
      }
      return { ...previous, featuredRoomIds: [...previous.featuredRoomIds, roomId] };
    });
  }

  /**
   * handleImageUpload
   * Shared handler for both the hero and OG image inputs — uploads
   * immediately to R2 and stores the resulting url/key on the given
   * form fields so "Save All Changes" always has a ready image.
   */
  async function handleImageUpload(event, folder, urlField, keyField, setIsUploading) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const uploadFormData = new FormData();
      uploadFormData.append("file", file);
      uploadFormData.append("folder", folder);

      const uploadResponse = await axios.post("/api/superAdmin/content/upload", uploadFormData);
      handleFieldChange(urlField, uploadResponse.data.data.url);
      handleFieldChange(keyField, uploadResponse.data.data.key);
      showToast("✓ Image uploaded. Don't forget to Save All Changes.", "success");
    } catch {
      showToast("✕ We couldn't upload this image. Please try again.", "error");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleSaveAll() {
    setIsSaving(true);
    try {
      await saveHomepageSettings(formValues);
      showToast("✓ Homepage settings saved successfully.", "success");
    } catch (submitError) {
      const message = submitError?.response?.data?.message || "We couldn't save the homepage settings. Please try again.";
      showToast(`✕ ${message}`, "error");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <section className="homepageSection">
        <div className="homepageSkeleton" />
      </section>
    );
  }

  if (error) {
    return (
      <section className="homepageSection">
        <div className="homepageStateMessage homepageStateMessage--error">
          We couldn&apos;t load the homepage settings. Please try again.
        </div>
      </section>
    );
  }

  return (
    <section className="homepageSection">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <div className="homepageHeaderRow">
        <div>
          <span className="homepageEyebrow">Content Management</span>
          <h1 className="homepageTitle">Homepage Customization</h1>
        </div>
        <button type="button" className="homepageSaveButton" onClick={handleSaveAll} disabled={isSaving}>
          {isSaving ? "Saving…" : "Save All Changes"}
        </button>
      </div>

      {/* ---------- Section 0: Brand Identity (locked — see BrandingCard.jsx) ---------- */}
      <div className="homepagePanel">
        <h2 className="homepagePanelTitle">Brand Identity</h2>
        <p className="homepageFormHint">
          Set once during first-run setup and shown across the Header logo, Footer, Hero section, and browser
          tab title. Locked here on purpose — the resort name and accent color touch too many places
          (Header/Footer copy, generated invoices, email subjects) to change casually from this form. To
          change it, a developer needs to update it directly in the database (SystemSettings.siteTitle /
          .brandAccentColor).
        </p>
        <div className="homepageFormField">
          <label htmlFor="siteTitle">Resort Name</label>
          <input id="siteTitle" type="text" value={formValues.siteTitle} disabled readOnly />
        </div>
        <div className="homepageFormField">
          <label htmlFor="brandAccentColor">Brand Accent Color</label>
          <div className="homepageColorFieldRow">
            <input
              id="brandAccentColor"
              type="color"
              value={formValues.brandAccentColor || "#3f7d52"}
              disabled
              readOnly
            />
            <input
              type="text"
              value={formValues.brandAccentColor}
              disabled
              readOnly
              className="homepageColorHexInput"
            />
          </div>
          <p className="homepageFormHint">Used for buttons, active states, and highlights site-wide.</p>
        </div>
      </div>

      {/* ---------- Section 1: Hero ---------- */}
      <div className="homepagePanel">
        <h2 className="homepagePanelTitle">Hero Section</h2>
        <div className="homepageFormField">
          <label htmlFor="heroTagline">Hero Tagline</label>
          <input
            id="heroTagline"
            type="text"
            value={formValues.heroTagline}
            onChange={(event) => handleFieldChange("heroTagline", event.target.value)}
            placeholder="Experience Luxury Beachside"
          />
        </div>
        <div className="homepageFormField">
          <label htmlFor="heroImage">Hero Image</label>
          <div className="homepageImageUpload">
            {formValues.heroImageUrl && (
              <div className="homepageImagePreviewWrapper homepageImagePreviewWrapper--wide">
                <Image src={formValues.heroImageUrl} alt="Hero preview" fill sizes="220px" style={{ objectFit: "cover" }} unoptimized />
              </div>
            )}
            <input
              id="heroImage"
              type="file"
              accept="image/*"
              disabled={isUploadingHero}
              onChange={(event) => handleImageUpload(event, "homepage", "heroImageUrl", "heroImageKey", setIsUploadingHero)}
            />
          </div>
        </div>
      </div>

      {/* ---------- Section 2: Featured Rooms ---------- */}
      <div className="homepagePanel">
        <h2 className="homepagePanelTitle">Featured Rooms</h2>
        <p className="homepageFormHint">Select up to 3 rooms to showcase on the homepage.</p>
        <div className="homepageRoomPicker">
          {rooms.map((room) => {
            const isSelected = formValues.featuredRoomIds.includes(room.id);
            return (
              <label key={room.id} className={`homepageRoomOption${isSelected ? " homepageRoomOption--selected" : ""}`}>
                <input type="checkbox" checked={isSelected} onChange={() => handleFeaturedRoomToggle(room.id)} />
                {room.name}
              </label>
            );
          })}
          {rooms.length === 0 && <p className="homepageFormHint">No rooms yet — add rooms under Rooms first.</p>}
        </div>
      </div>

      {/* ---------- Section 2.5: About Section Differentiators ---------- */}
      <div className="homepagePanel">
        <h2 className="homepagePanelTitle">About Section Differentiators</h2>
        <p className="homepageFormHint">
          The 3 highlight cards shown under the story on the About section. Leave blank to keep the default copy.
        </p>
        {[1, 2, 3].map((cardNumber) => (
          <div className="homepageFormRow" key={cardNumber}>
            <div className="homepageFormField">
              <label htmlFor={`aboutDifferentiator${cardNumber}Title`}>Card {cardNumber} Title</label>
              <input
                id={`aboutDifferentiator${cardNumber}Title`}
                type="text"
                value={formValues[`aboutDifferentiator${cardNumber}Title`]}
                onChange={(event) => handleFieldChange(`aboutDifferentiator${cardNumber}Title`, event.target.value)}
              />
            </div>
            <div className="homepageFormField">
              <label htmlFor={`aboutDifferentiator${cardNumber}Body`}>Card {cardNumber} Description</label>
              <input
                id={`aboutDifferentiator${cardNumber}Body`}
                type="text"
                value={formValues[`aboutDifferentiator${cardNumber}Body`]}
                onChange={(event) => handleFieldChange(`aboutDifferentiator${cardNumber}Body`, event.target.value)}
              />
            </div>
          </div>
        ))}
      </div>

      {/* ---------- Section 3: Testimonials Section ---------- */}
      <div className="homepagePanel">
        <h2 className="homepagePanelTitle">Testimonials Section</h2>
        <label className="homepageFormToggle">
          <input
            type="checkbox"
            checked={formValues.testimonialsSectionEnabled}
            onChange={(event) => handleFieldChange("testimonialsSectionEnabled", event.target.checked)}
          />
          Show testimonials section on homepage
        </label>
        <div className="homepageFormRow">
          <div className="homepageFormField">
            <label htmlFor="testimonialsCount">Number to show</label>
            <select
              id="testimonialsCount"
              value={formValues.testimonialsSectionCount}
              onChange={(event) => handleFieldChange("testimonialsSectionCount", Number(event.target.value))}
            >
              {[3, 6, 9].map((count) => (
                <option key={count} value={count}>{count}</option>
              ))}
            </select>
          </div>
          <label className="homepageFormToggle">
            <input
              type="checkbox"
              checked={formValues.testimonialsFeaturedOnly}
              onChange={(event) => handleFieldChange("testimonialsFeaturedOnly", event.target.checked)}
            />
            Featured only
          </label>
        </div>
      </div>

      {/* ---------- Section 4: Booking Prompt (was "CTA Section") ---------- */}
      <div className="homepagePanel">
        <h2 className="homepagePanelTitle">Booking Prompt</h2>
        <label className="homepageFormToggle">
          <input
            type="checkbox"
            checked={formValues.ctaSectionVisible}
            onChange={(event) => handleFieldChange("ctaSectionVisible", event.target.checked)}
          />
          Show this section on homepage
        </label>
        <div className="homepageFormField">
          <label htmlFor="ctaSectionHeading">Section Heading</label>
          <input
            id="ctaSectionHeading"
            type="text"
            value={formValues.ctaSectionHeading}
            onChange={(event) => handleFieldChange("ctaSectionHeading", event.target.value)}
          />
        </div>
        <div className="homepageFormField">
          <label htmlFor="ctaSectionSubtext">Section Subtext</label>
          <input
            id="ctaSectionSubtext"
            type="text"
            value={formValues.ctaSectionSubtext}
            onChange={(event) => handleFieldChange("ctaSectionSubtext", event.target.value)}
          />
        </div>
        <div className="homepageFormField">
          <label htmlFor="ctaButtonText">Button Text</label>
          <input
            id="ctaButtonText"
            type="text"
            value={formValues.ctaButtonText}
            onChange={(event) => handleFieldChange("ctaButtonText", event.target.value)}
            placeholder="Plan Your Stay"
          />
        </div>
      </div>

      {/* ---------- Section 5: SEO & Metadata ---------- */}
      <div className="homepagePanel">
        <h2 className="homepagePanelTitle">SEO &amp; Metadata</h2>
        <p className="homepageFormHint">
          Page title comes from Resort Name in Brand Identity above.
        </p>
        <div className="homepageFormField">
          <label htmlFor="siteDescription">Page Description</label>
          <textarea
            id="siteDescription"
            rows={3}
            maxLength={160}
            value={formValues.siteDescription}
            onChange={(event) => handleFieldChange("siteDescription", event.target.value)}
          />
          <p className="homepageFormHint homepageFormCharCount">{formValues.siteDescription.length} / 160</p>
        </div>
        <div className="homepageFormField">
          <label htmlFor="ogImage">Social Share Image (OG Image)</label>
          <div className="homepageImageUpload">
            {formValues.ogImageUrl && (
              <div className="homepageImagePreviewWrapper">
                <Image src={formValues.ogImageUrl} alt="OG image preview" fill sizes="120px" style={{ objectFit: "cover" }} unoptimized />
              </div>
            )}
            <input
              id="ogImage"
              type="file"
              accept="image/*"
              disabled={isUploadingOg}
              onChange={(event) => handleImageUpload(event, "homepage", "ogImageUrl", "ogImageKey", setIsUploadingOg)}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
