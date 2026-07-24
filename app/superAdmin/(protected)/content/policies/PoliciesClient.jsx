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
  { key: "bookingPolicies", label: "Booking Policies" },
  { key: "houseRules", label: "House Rules" },
  { key: "cancellationPolicy", label: "Cancellation" },
  { key: "termsOfService", label: "Terms" },
  { key: "privacyPolicy", label: "Privacy" },
  { key: "aboutPageContent", label: "About" },
  { key: "checkInOut", label: "Check-In / Out" },
  { key: "contactInfo", label: "Contact Info" },
];

const EMPTY_FORM = {
  houseRules: "",
  bookingPolicies: "",
  bookingPoliciesIntro: "",
  cancellationPolicy: "",
  cancellationPolicyIntro: "",
  refundFullWindowDays: "",
  refundFullRefundFee: "",
  refundPartialWindowDays: "",
  refundPartialPercent: "",
  termsOfService: "",
  privacyPolicy: "",
  aboutPageContent: "",
  checkInTime: "",
  checkOutTime: "",
  checkInNote: "",
  checkOutNote: "",
  resortPhone: "",
  resortEmail: "",
  resortAddress: "",
  resortLatitude: "",
  resortLongitude: "",
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
      bookingPolicies: policies.bookingPolicies ?? "",
      bookingPoliciesIntro: policies.bookingPoliciesIntro ?? "",
      cancellationPolicy: policies.cancellationPolicy ?? "",
      cancellationPolicyIntro: policies.cancellationPolicyIntro ?? "",
      refundFullWindowDays: policies.refundFullWindowDays ?? "",
      refundFullRefundFee: policies.refundFullRefundFee ?? "",
      refundPartialWindowDays: policies.refundPartialWindowDays ?? "",
      refundPartialPercent: policies.refundPartialPercent ?? "",
      termsOfService: policies.termsOfService ?? "",
      privacyPolicy: policies.privacyPolicy ?? "",
      aboutPageContent: policies.aboutPageContent ?? "",
      checkInTime: policies.checkInTime ?? "",
      checkOutTime: policies.checkOutTime ?? "",
      checkInNote: policies.checkInNote ?? "",
      checkOutNote: policies.checkOutNote ?? "",
      resortPhone: policies.resortPhone ?? "",
      resortEmail: policies.resortEmail ?? "",
      resortAddress: policies.resortAddress ?? "",
      resortLatitude: policies.resortLatitude ?? "",
      resortLongitude: policies.resortLongitude ?? "",
    });
  }, [policies]);

  function handleFieldChange(field, value) {
    setFormValues((previous) => ({ ...previous, [field]: value }));
  }

  async function handleSaveAll() {
    setIsSaving(true);
    try {
      // The refund table fields are numeric in the schema (Int?), but the
      // number inputs above hand back strings — convert here so Prisma
      // doesn't reject the write. Blank input -> null (falls back to the
      // schema default on the visitor page).
      await savePolicies({
        ...formValues,
        refundFullWindowDays: formValues.refundFullWindowDays === "" ? null : Number(formValues.refundFullWindowDays),
        refundPartialWindowDays:
          formValues.refundPartialWindowDays === "" ? null : Number(formValues.refundPartialWindowDays),
        refundPartialPercent: formValues.refundPartialPercent === "" ? null : Number(formValues.refundPartialPercent),
        resortLatitude: formValues.resortLatitude === "" ? null : Number(formValues.resortLatitude),
        resortLongitude: formValues.resortLongitude === "" ? null : Number(formValues.resortLongitude),
      });
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

      {activeTab === "checkInOut" ? (
        <div className="policiesTabPanel">
          <div className="policiesFormField">
            <label htmlFor="checkInTime">Check-In Time</label>
            <input
              id="checkInTime"
              type="text"
              placeholder="e.g. 2:00 PM"
              value={formValues.checkInTime}
              onChange={(event) => handleFieldChange("checkInTime", event.target.value)}
            />
          </div>
          <div className="policiesFormField">
            <label htmlFor="checkInNote">Check-In Note</label>
            <textarea
              id="checkInNote"
              rows={2}
              placeholder="e.g. Early check-in subject to availability. Request at least 48 hours in advance."
              value={formValues.checkInNote}
              onChange={(event) => handleFieldChange("checkInNote", event.target.value)}
            />
          </div>
          <div className="policiesFormField">
            <label htmlFor="checkOutTime">Check-Out Time</label>
            <input
              id="checkOutTime"
              type="text"
              placeholder="e.g. 12:00 PM"
              value={formValues.checkOutTime}
              onChange={(event) => handleFieldChange("checkOutTime", event.target.value)}
            />
          </div>
          <div className="policiesFormField">
            <label htmlFor="checkOutNote">Check-Out Note</label>
            <textarea
              id="checkOutNote"
              rows={2}
              placeholder="e.g. Late check-out subject to availability. Additional half-day charge may apply."
              value={formValues.checkOutNote}
              onChange={(event) => handleFieldChange("checkOutNote", event.target.value)}
            />
          </div>
        </div>
      ) : activeTab === "contactInfo" ? (
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
          <div className="policiesFormFieldRow">
            <div className="policiesFormField">
              <label htmlFor="resortLatitude">Map Latitude</label>
              <input
                id="resortLatitude"
                type="number"
                step="0.000001"
                placeholder="e.g. 14.5995"
                value={formValues.resortLatitude}
                onChange={(event) => handleFieldChange("resortLatitude", event.target.value)}
              />
            </div>
            <div className="policiesFormField">
              <label htmlFor="resortLongitude">Map Longitude</label>
              <input
                id="resortLongitude"
                type="number"
                step="0.000001"
                placeholder="e.g. 120.9842"
                value={formValues.resortLongitude}
                onChange={(event) => handleFieldChange("resortLongitude", event.target.value)}
              />
            </div>
          </div>
          <p className="policiesMapHint">
            Pin location shown on the visitor site&apos;s Contact footer. Get exact coordinates by
            right-clicking the spot on Google Maps and copying the numbers shown at the top.
          </p>
        </div>
      ) : (
        <div className="policiesTabPanel">
          {activeTab === "bookingPolicies" ? (
            <div className="policiesFormField">
              <label htmlFor="bookingPoliciesIntro">Section Intro</label>
              <input
                id="bookingPoliciesIntro"
                type="text"
                placeholder="The following terms apply to all reservations made directly with Villa Azure Resort…"
                value={formValues.bookingPoliciesIntro}
                onChange={(event) => handleFieldChange("bookingPoliciesIntro", event.target.value)}
              />
            </div>
          ) : null}
          {activeTab === "cancellationPolicy" ? (
            <>
              <div className="policiesFormField">
                <label htmlFor="cancellationPolicyIntro">Section Intro</label>
                <input
                  id="cancellationPolicyIntro"
                  type="text"
                  placeholder="We understand that plans change. The following refund schedule applies…"
                  value={formValues.cancellationPolicyIntro}
                  onChange={(event) => handleFieldChange("cancellationPolicyIntro", event.target.value)}
                />
              </div>
              <div className="policiesFormField">
                <label htmlFor="refundFullWindowDays">Full-Refund Window (days before check-in)</label>
                <input
                  id="refundFullWindowDays"
                  type="number"
                  min="0"
                  placeholder="14"
                  value={formValues.refundFullWindowDays}
                  onChange={(event) => handleFieldChange("refundFullWindowDays", event.target.value)}
                />
              </div>
              <div className="policiesFormField">
                <label htmlFor="refundFullRefundFee">Processing Fee (deducted from full refund)</label>
                <input
                  id="refundFullRefundFee"
                  type="text"
                  placeholder="₱500"
                  value={formValues.refundFullRefundFee}
                  onChange={(event) => handleFieldChange("refundFullRefundFee", event.target.value)}
                />
              </div>
              <div className="policiesFormField">
                <label htmlFor="refundPartialWindowDays">Partial-Refund Window (days before check-in)</label>
                <input
                  id="refundPartialWindowDays"
                  type="number"
                  min="0"
                  placeholder="7"
                  value={formValues.refundPartialWindowDays}
                  onChange={(event) => handleFieldChange("refundPartialWindowDays", event.target.value)}
                />
              </div>
              <div className="policiesFormField">
                <label htmlFor="refundPartialPercent">Partial-Refund Percentage</label>
                <input
                  id="refundPartialPercent"
                  type="number"
                  min="0"
                  max="100"
                  placeholder="50"
                  value={formValues.refundPartialPercent}
                  onChange={(event) => handleFieldChange("refundPartialPercent", event.target.value)}
                />
              </div>
            </>
          ) : null}
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
