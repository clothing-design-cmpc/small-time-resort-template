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
import LocationPickerMap from "@/components/superAdmin/LocationPickerMap";
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
  resortWhatsapp: "",
  resortViber: "",
  resortMessengerUsername: "",
  resortLatitude: "",
  resortLongitude: "",
  adminTelegramChatIds: "",
};

export default function PoliciesClient() {
  const { policies, isLoading, error, savePolicies } = usePolicies();
  const { toasts, showToast, dismissToast } = useToast();

  const [activeTab, setActiveTab] = useState("houseRules");
  const [formValues, setFormValues] = useState(EMPTY_FORM);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // --- Manual "Send Message Now" (Task 1 — sends directly, separate
  // from the automatic booking-status alerts) ---
  const [telegramMessageDraft, setTelegramMessageDraft] = useState("");
  const [isSendingTelegramMessage, setIsSendingTelegramMessage] = useState(false);

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
      resortWhatsapp: policies.resortWhatsapp ?? "",
      resortViber: policies.resortViber ?? "",
      resortMessengerUsername: policies.resortMessengerUsername ?? "",
      resortLatitude: policies.resortLatitude ?? "",
      resortLongitude: policies.resortLongitude ?? "",
      adminTelegramChatIds: policies.adminTelegramChatIds ?? "",
    });
  }, [policies]);

  function handleFieldChange(field, value) {
    setFormValues((previous) => ({ ...previous, [field]: value }));
  }

  /**
   * handleLocationChange
   * Called by LocationPickerMap on click/drag/search/geolocate — sets
   * both resortLatitude and resortLongitude together in one state
   * update (rather than two separate handleFieldChange calls) so the
   * map, the number inputs below it, and the eventual saved row always
   * agree on the same pair. Rounds to 6 decimals — sub-meter precision,
   * plenty for a resort location, and avoids storing Leaflet's raw
   * floating-point noise verbatim.
   */
  function handleLocationChange(latitude, longitude) {
    setFormValues((previous) => ({
      ...previous,
      resortLatitude: Number(latitude.toFixed(6)),
      resortLongitude: Number(longitude.toFixed(6)),
    }));
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

  /**
   * handleSendTelegramMessage
   * Fires the free-form text in telegramMessageDraft straight to every
   * configured admin chat ID via /api/superAdmin/content/policies/
   * telegram-send — separate from the automatic per-status booking
   * alerts (services/bookingTelegramAlerts.js), which fire on their
   * own. This is a manual, one-off broadcast (e.g. "closed this
   * weekend for maintenance").
   */
  async function handleSendTelegramMessage() {
    if (!telegramMessageDraft.trim()) {
      showToast("✕ Type a message first.", "error");
      return;
    }

    setIsSendingTelegramMessage(true);
    try {
      const response = await fetch("/api/superAdmin/content/policies/telegram-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: telegramMessageDraft.trim() }),
      });
      const result = await response.json();

      if (!result.success) {
        showToast(`✕ ${result.message}`, "error");
        return;
      }

      showToast(result.message, "success");
      setTelegramMessageDraft("");
    } catch (sendError) {
      showToast("✕ Network error — please try again.", "error");
    } finally {
      setIsSendingTelegramMessage(false);
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
          <div className="policiesTelegramSetup">
            <span className="policiesTelegramSetupTitle">Admin Telegram Alerts</span>
            <p className="policiesMapHint" style={{ marginBottom: "0.4rem" }}>
              Every new booking or walk-in inquiry sends a free Telegram message to the chat ID(s)
              below — separate from the Resort Phone above (that&apos;s what guests see). Leave blank
              to turn this off. One-time setup per admin:
            </p>
            <ol className="policiesTelegramSetupSteps">
              <li>
                In Telegram, message <strong>@BotFather</strong>, send <code>/newbot</code>, and
                follow the prompts to create the resort&apos;s bot (skip this if the bot already
                exists).
              </li>
              <li>
                Have the resort&apos;s developer add the bot token BotFather gave you to the
                project&apos;s <code>TELEGRAM_BOT_TOKEN</code> environment variable.
              </li>
              <li>
                Each admin who wants alerts: search for the bot&apos;s username in Telegram and tap{" "}
                <strong>Start</strong> (or send it any message) — the bot can&apos;t message you
                until you&apos;ve done this once.
              </li>
              <li>
                Message <strong>@userinfobot</strong> — it replies instantly with your numeric chat
                ID.
              </li>
              <li>
                Paste that chat ID below. Add more than one by separating them with commas (e.g.{" "}
                <code>123456789, 987654321</code>).
              </li>
              <li>
                Once everything above is set up — or any time you add another admin&apos;s (e.g. the
                owner&apos;s) Telegram chat ID — click <strong>Save All Changes</strong> at the top of
                this page. The chat ID field alone doesn&apos;t take effect until it&apos;s saved.
              </li>
            </ol>
          </div>
          <div className="policiesFormField">
            <label htmlFor="adminTelegramChatIds">Admin Telegram Alert Chat IDs</label>
            <input
              id="adminTelegramChatIds"
              type="text"
              placeholder="e.g. 123456789, 987654321"
              value={formValues.adminTelegramChatIds}
              onChange={(event) => handleFieldChange("adminTelegramChatIds", event.target.value)}
            />
          </div>
          <div className="policiesTelegramSetup">
            <span className="policiesTelegramSetupTitle">Send a Message Now</span>
            <p className="policiesMapHint" style={{ marginBottom: "0.4rem" }}>
              Sends this text directly to every chat ID above right now — separate from the
              automatic booking alerts (new/pending, booked, cancelled, auto-cancelled, rebooked),
              which send their own messages on their own. Use this for one-off announcements (e.g.
              &quot;Closed this weekend for maintenance&quot;). Save your chat IDs above first if you
              haven&apos;t yet.
            </p>
            <div className="policiesFormField">
              <label htmlFor="telegramMessageDraft">Message</label>
              <textarea
                id="telegramMessageDraft"
                rows={3}
                placeholder="Type the message to send to Telegram now..."
                value={telegramMessageDraft}
                onChange={(event) => setTelegramMessageDraft(event.target.value)}
                maxLength={4000}
              />
            </div>
            <button
              type="button"
              className="policiesSaveButton"
              onClick={handleSendTelegramMessage}
              disabled={isSendingTelegramMessage || !telegramMessageDraft.trim()}
            >
              {isSendingTelegramMessage ? "Sending…" : "Send Message Now"}
            </button>
          </div>
          <p className="policiesMapHint">
            Message Us channels — the floating &quot;Request a callback&quot; button on the visitor site shows
            a button for each one filled in below. Leave any of these blank to hide that channel.
          </p>
          <div className="policiesFormField">
            <label htmlFor="resortWhatsapp">WhatsApp Number</label>
            <input
              id="resortWhatsapp"
              type="tel"
              placeholder="e.g. +63 917 123 4567"
              value={formValues.resortWhatsapp}
              onChange={(event) => handleFieldChange("resortWhatsapp", event.target.value)}
            />
          </div>
          <div className="policiesFormField">
            <label htmlFor="resortViber">Viber Number</label>
            <input
              id="resortViber"
              type="tel"
              placeholder="e.g. +63 917 123 4567"
              value={formValues.resortViber}
              onChange={(event) => handleFieldChange("resortViber", event.target.value)}
            />
          </div>
          <div className="policiesFormField">
            <label htmlFor="resortMessengerUsername">Facebook Messenger Username</label>
            <input
              id="resortMessengerUsername"
              type="text"
              placeholder="e.g. yourprivateresort (from facebook.com/yourprivateresort)"
              value={formValues.resortMessengerUsername}
              onChange={(event) => handleFieldChange("resortMessengerUsername", event.target.value)}
            />
          </div>
          <div className="policiesFormField">
            <label>Pick Location on Map</label>
            <LocationPickerMap
              latitude={formValues.resortLatitude === "" ? null : formValues.resortLatitude}
              longitude={formValues.resortLongitude === "" ? null : formValues.resortLongitude}
              onLocationChange={handleLocationChange}
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
            Pin location shown on the visitor site&apos;s Contact footer. Use the map above (click,
            drag the pin, search, or &quot;Use my location&quot;) to set this automatically, or type exact
            coordinates below by right-clicking the spot on Google Maps and copying the numbers shown at the top.
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
                placeholder="The following terms apply to all reservations made directly with your-private-resort…"
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