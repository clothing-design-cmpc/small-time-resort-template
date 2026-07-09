/**
 * FILE: app/superAdmin/(protected)/content/policies/PoliciesClient.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Renders the Policies & Content Pages editor: a tab per content type
 * (House Rules, Cancellation, Terms, Privacy, About, Contact Info),
 * a plain-text/markdown textarea per tab, a live preview toggle, and
 * one "Save All Changes" button that persists every tab at once
 * (blueprint Page 8).
 *
 * DATA FLOW:
 * 1. usePolicies() fetches the singleton settings row on mount
 * 2. Local form state is seeded from that row once it loads, and
 *    edited per-tab from then on
 * 3. "Save All Changes" calls savePolicies() with the full set of
 *    fields — the tabs the admin didn't touch are simply resubmitted
 *    unchanged
 */
"use client";

import { useEffect, useState } from "react";
import { usePolicies } from "@/hooks/usePolicies";
import { useToast } from "@/app/superAdmin/shared/useToast";
import ToastStack from "@/app/superAdmin/shared/ToastStack";
import "./Policies.css";

const TABS = [
  { key: "houseRules", label: "House Rules" },
  { key: "cancellationPolicy", label: "Cancellation" },
  { key: "termsOfService", label: "Terms" },
  { key: "privacyPolicy", label: "Privacy" },
  { key: "aboutPageContent", label: "About" },
  { key: "contactInfo", label: "Contact Info" },
];

const EMPTY_FORM = {
  houseRules: "",
  cancellationPolicy: "",
  termsOfService: "",
  privacyPolicy: "",
  aboutPageContent: "",
  resortPhone: "",
  resortEmail: "",
  resortAddress: "",
};

export default function PoliciesClient() {
  const { policies, isLoading, error, savePolicies } = usePolicies();
  const { toasts, showToast, dismissToast } = useToast();

  const [activeTab, setActiveTab] = useState("houseRules");
  const [formValues, setFormValues] = useState(EMPTY_FORM);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Seed local form state once the singleton row loads — after that,
  // edits live only in formValues until "Save All Changes" is pressed.
  useEffect(() => {
    if (!policies) return;
    setFormValues({
      houseRules: policies.houseRules ?? "",
      cancellationPolicy: policies.cancellationPolicy ?? "",
      termsOfService: policies.termsOfService ?? "",
      privacyPolicy: policies.privacyPolicy ?? "",
      aboutPageContent: policies.aboutPageContent ?? "",
      resortPhone: policies.resortPhone ?? "",
      resortEmail: policies.resortEmail ?? "",
      resortAddress: policies.resortAddress ?? "",
    });
  }, [policies]);

  function handleFieldChange(field, value) {
    setFormValues((previous) => ({ ...previous, [field]: value }));
  }

  async function handleSaveAll() {
    setIsSaving(true);
    try {
      await savePolicies(formValues);
      showToast("✓ Policies saved successfully.", "success");
    } catch (submitError) {
      const message = submitError?.response?.data?.message || "We couldn't save the policies. Please try again.";
      showToast(`✕ ${message}`, "error");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <section className="policiesSection">
        <div className="policiesSkeleton" />
      </section>
    );
  }

  if (error) {
    return (
      <section className="policiesSection">
        <div className="policiesStateMessage policiesStateMessage--error">
          We couldn&apos;t load the policies. Please try again.
        </div>
      </section>
    );
  }

  return (
    <section className="policiesSection">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <div className="policiesHeaderRow">
        <div>
          <span className="policiesEyebrow">Content Management</span>
          <h1 className="policiesTitle">Policies &amp; Content Pages</h1>
        </div>
        <div className="policiesHeaderActions">
          <button type="button" className="policiesPreviewButton" onClick={() => setIsPreviewMode((previous) => !previous)}>
            {isPreviewMode ? "Edit" : "Preview"}
          </button>
          <button type="button" className="policiesSaveButton" onClick={handleSaveAll} disabled={isSaving}>
            {isSaving ? "Saving…" : "Save All Changes"}
          </button>
        </div>
      </div>

      <div className="policiesTabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            className={`policiesTab${activeTab === tab.key ? " policiesTab--active" : ""}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "contactInfo" ? (
        <div className="policiesTabPanel">
          <div className="policiesFormField">
            <label htmlFor="resortPhone">Resort Phone</label>
            <input
              id="resortPhone"
              type="text"
              value={formValues.resortPhone}
              onChange={(event) => handleFieldChange("resortPhone", event.target.value)}
            />
          </div>
          <div className="policiesFormField">
            <label htmlFor="resortEmail">Resort Email</label>
            <input
              id="resortEmail"
              type="email"
              value={formValues.resortEmail}
              onChange={(event) => handleFieldChange("resortEmail", event.target.value)}
            />
          </div>
          <div className="policiesFormField">
            <label htmlFor="resortAddress">Resort Address</label>
            <textarea
              id="resortAddress"
              rows={3}
              value={formValues.resortAddress}
              onChange={(event) => handleFieldChange("resortAddress", event.target.value)}
            />
          </div>
        </div>
      ) : (
        <div className="policiesTabPanel">
          {isPreviewMode ? (
            <div className="policiesPreview">
              {formValues[activeTab] ? (
                formValues[activeTab].split("\n").map((line, index) => <p key={index}>{line || "\u00A0"}</p>)
              ) : (
                <p className="policiesPreviewEmpty">Nothing written yet for this page.</p>
              )}
            </div>
          ) : (
            <textarea
              className="policiesTextEditor"
              rows={16}
              value={formValues[activeTab]}
              onChange={(event) => handleFieldChange(activeTab, event.target.value)}
              placeholder={`Write the ${TABS.find((tab) => tab.key === activeTab)?.label} content here…`}
            />
          )}
        </div>
      )}
    </section>
  );
}
