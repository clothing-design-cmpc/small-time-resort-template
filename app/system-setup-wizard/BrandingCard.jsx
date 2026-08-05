/**
 * FILE: app/system-setup-wizard/BrandingCard.jsx
 * ROLE: Client Component — rendered inside AdminSetupStep.jsx (Step 3)
 *
 * PURPOSE:
 * Lets the developer set the resort's display name and the 5-token
 * brand color system during first-run setup, instead of hand-editing
 * Header.jsx, Footer.jsx, Hero.jsx, and app/styles/globals.css. Fully
 * optional and never blocks progressing to Step 4 — every field
 * already has a schema-level default (SystemSettings.siteTitle /
 * .brandAccentColor / .brandSecondaryColor / .brandBackgroundColor /
 * .brandTextColor / .brandBorderColor) if this card is skipped
 * entirely. THIS IS THE ONLY PLACE these fields are ever editable
 * through the UI — the wizard itself only ever runs once
 * (isSetupWizardLocked() 404s the whole wizard, including this
 * card's own GET/PUT routes, the moment SystemSettings.setupFinalized
 * is set), and Super-Admin > Content > Homepage > Brand Identity
 * intentionally renders these fields read-only
 * (HomepageSettingsClient.jsx) since the resort name/colors touch too
 * many places (invoices, email subjects, every card/border/button
 * site-wide) to change casually after launch. Get it right here, or
 * change it directly in the DB afterward.
 *
 * DATA FLOW:
 * 1. On mount -> GET /api/system-setup-wizard/branding
 * 2. "Save Branding" -> PUT /api/system-setup-wizard/branding
 * 3. Never navigates anywhere itself — the parent step's own
 *    "Continue" flow (admin confirmation) still owns hand-off to
 *    RemainingEnvStep
 * 4. Receives showToast as a prop from AdminSetupStep's own useToast
 *    instance (Rule 22.4 sub-component pattern) instead of mounting a
 *    second ToastStack alongside the parent's
 */
"use client";

import { useEffect, useState } from "react";

const DEFAULT_ACCENT_COLOR = "#3f7d52";
const DEFAULT_SECONDARY_COLOR = "#c9935e";
const DEFAULT_BACKGROUND_COLOR = "#f8faf3";
const DEFAULT_TEXT_COLOR = "#1c2b20";
const DEFAULT_BORDER_COLOR = "#e5e2db";

// Each entry drives one color-picker row below. label/hint are shown
// to the developer; stateKey/defaultValue point at the matching piece
// of local state — keeping this as a list instead of 5 hand-written
// blocks means adding a 6th token later is a one-line change here.
const COLOR_FIELDS = [
  {
    stateKey: "accentColor",
    id: "wizardAccentColor",
    label: "Primary Accent",
    hint: "Buttons, links, and active states — used most often.",
  },
  {
    stateKey: "secondaryColor",
    id: "wizardSecondaryColor",
    label: "Secondary Accent",
    hint: "Hover states, badges, and secondary CTAs — complements the primary accent.",
  },
  {
    stateKey: "backgroundColor",
    id: "wizardBackgroundColor",
    label: "Background",
    hint: "The page background behind every section.",
  },
  {
    stateKey: "textColor",
    id: "wizardTextColor",
    label: "Text",
    hint: "Headings and body copy — lighter secondary/muted tones are derived from this automatically.",
  },
  {
    stateKey: "borderColor",
    id: "wizardBorderColor",
    label: "Border / Neutral",
    hint: "Card borders, dividers, and the subtle tint behind cards — also derived automatically.",
  },
];

export default function BrandingCard({ showToast }) {
  const [resortName, setResortName] = useState("");
  const [accentColor, setAccentColor] = useState(DEFAULT_ACCENT_COLOR);
  const [secondaryColor, setSecondaryColor] = useState(DEFAULT_SECONDARY_COLOR);
  const [backgroundColor, setBackgroundColor] = useState(DEFAULT_BACKGROUND_COLOR);
  const [textColor, setTextColor] = useState(DEFAULT_TEXT_COLOR);
  const [borderColor, setBorderColor] = useState(DEFAULT_BORDER_COLOR);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const colorState = { accentColor, secondaryColor, backgroundColor, textColor, borderColor };
  const colorSetters = {
    accentColor: setAccentColor,
    secondaryColor: setSecondaryColor,
    backgroundColor: setBackgroundColor,
    textColor: setTextColor,
    borderColor: setBorderColor,
  };

  useEffect(() => {
    async function fetchBranding() {
      setIsLoading(true);
      try {
        const response = await fetch("/api/system-setup-wizard/branding");
        const result = await response.json();
        if (result.success && result.data) {
          setResortName(result.data.siteTitle ?? "");
          setAccentColor(result.data.brandAccentColor || DEFAULT_ACCENT_COLOR);
          setSecondaryColor(result.data.brandSecondaryColor || DEFAULT_SECONDARY_COLOR);
          setBackgroundColor(result.data.brandBackgroundColor || DEFAULT_BACKGROUND_COLOR);
          setTextColor(result.data.brandTextColor || DEFAULT_TEXT_COLOR);
          setBorderColor(result.data.brandBorderColor || DEFAULT_BORDER_COLOR);
        }
      } catch {
        // Fails quiet — the form still renders with empty/default
        // values, and the schema-level defaults cover the DB side.
      } finally {
        setIsLoading(false);
      }
    }
    fetchBranding();
  }, []);

  async function handleSaveBranding() {
    if (!resortName.trim()) {
      showToast("✕ Resort name can't be empty.", "error");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/system-setup-wizard/branding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteTitle: resortName.trim(),
          brandAccentColor: accentColor,
          brandSecondaryColor: secondaryColor,
          brandBackgroundColor: backgroundColor,
          brandTextColor: textColor,
          brandBorderColor: borderColor,
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        showToast("✕ " + (result.message ?? "Couldn't save branding."), "error");
        return;
      }
      showToast("✓ Branding saved. Header, Footer, and page title will use this now.", "success");
    } catch {
      showToast("✕ We couldn't reach the server. Please try again.", "error");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="setupWizardCard setupWizardSubStepCard">
      <h2 className="setupWizardSubStepTitle">Brand your resort (optional)</h2>
      <p className="setupWizardBody">
        Set the resort name and a 5-color brand system — primary accent, secondary accent,
        background, text, and border — shown across the Header, Footer, Hero section, cards,
        and browser tab title. No code editing needed. This is the only time these are editable
        through the UI, so get them right before continuing — afterward, Super-Admin &gt; Content
        &gt; Homepage &gt; Brand Identity only shows them read-only.
      </p>

      {isLoading ? (
        <p className="setupWizardBody">Loading current branding…</p>
      ) : (
        <>
          <div className="setupWizardFormField">
            <label htmlFor="wizardResortName">Resort Name</label>
            <input
              id="wizardResortName"
              type="text"
              value={resortName}
              onChange={(event) => setResortName(event.target.value)}
              placeholder="Villa Azure Resort"
            />
          </div>

          {COLOR_FIELDS.map((field) => (
            <div className="setupWizardFormField" key={field.stateKey}>
              <label htmlFor={field.id}>{field.label}</label>
              <div className="setupWizardColorFieldRow">
                <input
                  id={field.id}
                  type="color"
                  value={colorState[field.stateKey]}
                  onChange={(event) => colorSetters[field.stateKey](event.target.value)}
                />
                <input
                  type="text"
                  value={colorState[field.stateKey]}
                  onChange={(event) => colorSetters[field.stateKey](event.target.value)}
                  placeholder={field.id === "wizardAccentColor" ? DEFAULT_ACCENT_COLOR : ""}
                  className="setupWizardColorHexInput"
                />
              </div>
              <p className="setupWizardFormHint">{field.hint}</p>
            </div>
          ))}

          <button
            type="button"
            className="setupWizardButtonSecondary"
            onClick={handleSaveBranding}
            disabled={isSaving}
          >
            {isSaving ? "Saving…" : "Save Branding"}
          </button>
        </>
      )}
    </div>
  );
}
