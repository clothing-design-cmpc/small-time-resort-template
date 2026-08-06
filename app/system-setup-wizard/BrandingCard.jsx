/**
 * FILE: app/system-setup-wizard/BrandingCard.jsx
 * ROLE: Client Component — rendered inside AdminSetupStep.jsx (Step 3)
 *
 * PURPOSE:
 * Lets the developer set the resort's display name and its full
 * 5-color brand palette (Accent, Background, Surface, Border, Text)
 * during first-run setup, instead of hand-editing Header.jsx,
 * Footer.jsx, Hero.jsx, and app/styles/globals.css. Fully optional and
 * never blocks progressing to Step 4 — every field already has a
 * schema-level default (SystemSettings.siteTitle /
 * .brandAccentColor/.brandBackgroundColor/.brandSurfaceColor/
 * .brandBorderColor/.brandTextColor) if this card is skipped
 * entirely. THIS IS THE ONLY PLACE these fields are ever editable
 * through the UI — the wizard itself only ever runs once
 * (isSetupWizardLocked() 404s the whole wizard, including this card's
 * own GET/PUT routes, the moment SystemSettings.setupFinalized is
 * set), and Super-Admin > Content > Homepage > Brand Identity
 * intentionally renders these fields read-only
 * (HomepageSettingsClient.jsx) since the resort name/colors touch too
 * many places (invoices, email subjects, the whole visitor site's
 * theme) to change casually after launch. Get it right here, or
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

// One place defining every color field this card edits — id must
// match the SystemSettings column name exactly, since it's used
// directly as the request body key on save.
const COLOR_FIELDS = [
  {
    id: "brandAccentColor",
    label: "Primary Accent",
    hint: "Buttons, links, and active states — the one color used everywhere for calls to action.",
    defaultValue: "#3f7d52",
  },
  {
    id: "brandBackgroundColor",
    label: "Background",
    hint: "The page background behind everything else.",
    defaultValue: "#f8faf3",
  },
  {
    id: "brandSurfaceColor",
    label: "Surface",
    hint: "Card and panel backgrounds — usually a step lighter or darker than the page background.",
    defaultValue: "#eef2e7",
  },
  {
    id: "brandBorderColor",
    label: "Border",
    hint: "Dividers and card outlines — keep this subtle, not high-contrast.",
    defaultValue: "#d8e0d2",
  },
  {
    id: "brandTextColor",
    label: "Text",
    hint: "Headings and body copy site-wide.",
    defaultValue: "#1c2b20",
  },
];

const DEFAULT_COLOR_VALUES = Object.fromEntries(COLOR_FIELDS.map((field) => [field.id, field.defaultValue]));

export default function BrandingCard({ showToast }) {
  const [resortName, setResortName] = useState("");
  const [colorValues, setColorValues] = useState(DEFAULT_COLOR_VALUES);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    async function fetchBranding() {
      setIsLoading(true);
      try {
        const response = await fetch("/api/system-setup-wizard/branding");
        const result = await response.json();
        if (result.success && result.data) {
          setResortName(result.data.siteTitle ?? "");
          // Merge over the defaults rather than replacing wholesale —
          // any field missing from the response (e.g. a DB row saved
          // before a newer color was added) still falls back cleanly.
          setColorValues((previous) => ({
            ...previous,
            ...Object.fromEntries(
              COLOR_FIELDS.map((field) => [field.id, result.data[field.id] || field.defaultValue])
            ),
          }));
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

  function handleColorChange(fieldId, value) {
    setColorValues((previous) => ({ ...previous, [fieldId]: value }));
  }

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
        body: JSON.stringify({ siteTitle: resortName.trim(), ...colorValues }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        showToast("✕ " + (result.message ?? "Couldn't save branding."), "error");
        return;
      }
      showToast("✓ Branding saved. The whole site will use this palette now.", "success");
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
        Set the resort name and 5-color palette shown across the Header, Footer, Hero
        section, browser tab title, and every card/button site-wide — no code editing
        needed. This is the only time these are editable through the UI, so get them
        right before continuing — afterward, Super-Admin &gt; Content &gt; Homepage &gt;
        Brand Identity only shows them read-only.
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
            <div className="setupWizardFormField" key={field.id}>
              <label htmlFor={`wizard-${field.id}`}>{field.label}</label>
              <div className="setupWizardColorFieldRow">
                <input
                  id={`wizard-${field.id}`}
                  type="color"
                  value={colorValues[field.id]}
                  onChange={(event) => handleColorChange(field.id, event.target.value)}
                />
                <input
                  type="text"
                  value={colorValues[field.id]}
                  onChange={(event) => handleColorChange(field.id, event.target.value)}
                  placeholder={field.defaultValue}
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
