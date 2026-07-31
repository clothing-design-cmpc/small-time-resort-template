/**
 * FILE: app/system-setup-wizard/BrandingCard.jsx
 * ROLE: Client Component — rendered inside AdminSetupStep.jsx (Step 3)
 *
 * PURPOSE:
 * Lets the developer set the resort's display name and brand accent
 * color during first-run setup, instead of hand-editing Header.jsx,
 * Footer.jsx, Hero.jsx, and app/styles/globals.css. Fully optional and
 * never blocks progressing to Step 4 — both fields already have
 * schema-level defaults (SystemSettings.siteTitle /
 * .brandAccentColor) if this card is skipped entirely. The same two
 * fields stay editable later from Super-Admin > Content > Homepage >
 * Brand Identity.
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

export default function BrandingCard({ showToast }) {
  const [resortName, setResortName] = useState("");
  const [accentColor, setAccentColor] = useState(DEFAULT_ACCENT_COLOR);
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
          setAccentColor(result.data.brandAccentColor || DEFAULT_ACCENT_COLOR);
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
        body: JSON.stringify({ siteTitle: resortName.trim(), brandAccentColor: accentColor }),
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
        Set the resort name and accent color shown across the Header, Footer, Hero
        section, and browser tab title — no code editing needed. Skip this and
        continue if you&apos;d rather set it up later from Super-Admin &gt; Content &gt;
        Homepage &gt; Brand Identity.
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

          <div className="setupWizardFormField">
            <label htmlFor="wizardAccentColor">Brand Accent Color</label>
            <div className="setupWizardColorFieldRow">
              <input
                id="wizardAccentColor"
                type="color"
                value={accentColor}
                onChange={(event) => setAccentColor(event.target.value)}
              />
              <input
                type="text"
                value={accentColor}
                onChange={(event) => setAccentColor(event.target.value)}
                placeholder="#3f7d52"
                className="setupWizardColorHexInput"
              />
            </div>
            <p className="setupWizardFormHint">Used for buttons, active states, and highlights site-wide.</p>
          </div>

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
