/**
 * FILE: app/superAdmin/(protected)/email-logs/EmailLogsClient.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Task 1 — lets the super-admin see, at a glance, whether every email
 * this app has tried to send actually went out or failed, and resend
 * any of them with every field autofilled from exactly what was sent
 * (or attempted) the first time.
 *
 * DATA FLOW:
 * 1. On mount and whenever page/status/emailType filter changes,
 *    fetches GET /api/admin/email-logs?page=&status=&emailType=
 * 2. Expanding a row (DataTable's built-in expand column) reveals the
 *    error message (if this attempt failed) and a Resend form —
 *    every field starts prefilled from that row's stored payload
 *    (EmailLog.payload), fully editable before sending
 * 3. Clicking "Resend" POSTs any edited fields to
 *    /api/admin/email-logs/{id}/resend, then silently re-fetches the
 *    current page so the brand-new attempt row appears at the top
 *    without a full-page reload or losing the current scroll position
 *
 * TOASTS: this component owns the single useToast instance and
 * <ToastStack> for the whole Email Logs page (Rule 22.2).
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import DataTable from "@/components/superAdmin/DataTable";
import StatusBadge from "@/components/superAdmin/StatusBadge";
import { useToast } from "@/app/superAdmin/shared/useToast";
import ToastStack from "@/app/superAdmin/shared/ToastStack";
import "./EmailLogs.css";

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const STATUS_FILTERS = [
  { value: "all", label: "All statuses" },
  { value: "sent", label: "Sent" },
  { value: "failed", label: "Failed" },
];

// Mirrors every emailType tag actually used by services/emailjs.js's
// call sites (see StatusBadge.jsx's matching entries) — kept as one
// list here so the filter dropdown and the badge colors never drift
// out of sync with what's really being logged.
const EMAIL_TYPE_FILTERS = [
  { value: "all", label: "All types" },
  { value: "booking_confirmation", label: "Booking Confirmation" },
  { value: "booking_pending", label: "Booking Pending" },
  { value: "booking_cancelled", label: "Booking Cancelled" },
  { value: "booking_auto_cancelled", label: "Auto-Cancelled" },
  { value: "booking_rebooked", label: "Booking Rebooked" },
  { value: "vault_otp", label: "Vault OTP" },
  { value: "breach_alert", label: "Breach Alert" },
  { value: "vault_passphrase_rotation", label: "Passphrase Rotation" },
  { value: "vault_url_rotation", label: "URL Rotation" },
  { value: "magic_login", label: "Magic Login" },
  { value: "owner_ip_updated", label: "Owner IP Updated" },
  { value: "vault_request_access", label: "Vault Access Request" },
  { value: "env_check_test", label: "Env Check Test" },
  { value: "env_check_alert", label: "Env Check Alert" },
  { value: "general", label: "General" },
];

// Fields the resend form exposes, in display order — matches exactly
// what EmailLog.payload stores (services/emailjs.js's sendGeneralEmail
// params), so every field that was actually used is editable here.
const RESEND_FIELDS = [
  { key: "toEmail", label: "Recipient Email", type: "input", full: false },
  { key: "replyTo", label: "Reply-To (optional)", type: "input", full: false },
  { key: "subject", label: "Subject", type: "input", full: true },
  { key: "eyebrow", label: "Eyebrow", type: "input", full: false },
  { key: "heading", label: "Heading", type: "input", full: false },
  { key: "intro", label: "Intro", type: "textarea", full: true },
  { key: "highlightLine1", label: "Highlight Line 1", type: "input", full: false },
  { key: "highlightLine2", label: "Highlight Line 2", type: "input", full: false },
  { key: "bodyMessage", label: "Body Message", type: "textarea", full: true },
];

/**
 * parseJsonResponse
 * A response that came back but isn't valid JSON (a crashed route's
 * HTML error page) is a server-side problem, not the same thing as
 * fetch() itself failing to reach the server at all — each gets its
 * own honest message.
 */
async function parseJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    throw new Error(
      response.ok
        ? "The server sent back an unexpected response. Please try again."
        : `The server returned an error (${response.status}). Please try again.`
    );
  }
}

/**
 * ResendForm
 * Autofilled (Task 1's "information autofilled") editable form for
 * one EmailLog row. Owns its own field state, seeded once from the
 * row's stored payload — edits here never touch the stored log row
 * itself, only what gets sent on the next Resend click.
 */
function ResendForm({ log, onResend, isResending }) {
  const [fields, setFields] = useState(() => ({
    toEmail: log.payload?.toEmail ?? log.toEmail ?? "",
    replyTo: log.payload?.replyTo ?? "",
    subject: log.payload?.subject ?? log.subject ?? "",
    eyebrow: log.payload?.eyebrow ?? "",
    heading: log.payload?.heading ?? "",
    intro: log.payload?.intro ?? "",
    highlightLine1: log.payload?.highlightLine1 ?? "",
    highlightLine2: log.payload?.highlightLine2 ?? "",
    bodyMessage: log.payload?.bodyMessage ?? "",
  }));

  function updateField(key, value) {
    setFields((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="emailLogDetailPanel">
      {log.status === "failed" && (
        <div className="emailLogDetailField--full">
          <span className="emailLogDetailLabel">Failure Reason</span>
          <span className="emailLogDetailValue--error">
            {log.errorMessage || "No further detail was recorded for this failure."}
          </span>
        </div>
      )}

      <div className="emailLogResendForm">
        <div className="emailLogResendGrid">
          {RESEND_FIELDS.map((field) => (
            <div
              key={field.key}
              className={`emailLogFormField${field.full ? " emailLogFormField--full" : ""}`}
            >
              <label className="emailLogFormLabel" htmlFor={`${log.id}-${field.key}`}>
                {field.label}
              </label>
              {field.type === "textarea" ? (
                <textarea
                  id={`${log.id}-${field.key}`}
                  className="emailLogFormTextarea"
                  value={fields[field.key]}
                  onChange={(event) => updateField(field.key, event.target.value)}
                />
              ) : (
                <input
                  id={`${log.id}-${field.key}`}
                  type="text"
                  className="emailLogFormInput"
                  value={fields[field.key]}
                  onChange={(event) => updateField(field.key, event.target.value)}
                />
              )}
            </div>
          ))}
        </div>

        <div className="emailLogResendActions">
          <button
            type="button"
            className="emailLogResendButton"
            disabled={isResending || !fields.toEmail}
            onClick={() => onResend(log.id, fields)}
          >
            {isResending ? "Resending…" : "Resend"}
          </button>
          {log.retryCount > 0 && (
            <span className="emailLogRetryNote">
              Resent {log.retryCount} time{log.retryCount === 1 ? "" : "s"} so far.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * buildEmailLogRow
 * Shapes one EmailLog record into the row object DataTable expects.
 * `raw` carries the original record through to renderExpandedRow.
 */
function buildEmailLogRow(log) {
  return {
    id: log.id,
    raw: log,
    status: <StatusBadge status={log.status} />,
    type: <StatusBadge status={log.emailType} />,
    recipient: log.toEmail || "—",
    subject: (
      <span className="emailLogsSubjectCell" title={log.subject}>
        {log.subject || "—"}
      </span>
    ),
    booking: log.relatedBookingId ? (
      <span className="adminMono">{log.relatedBookingId.slice(0, 8)}…</span>
    ) : (
      "—"
    ),
    attemptedAt: DATE_FORMATTER.format(new Date(log.createdAt)),
    retries: log.retryCount > 0 ? log.retryCount : "—",
  };
}

const columns = [
  { key: "status", label: "Status" },
  { key: "type", label: "Type" },
  { key: "recipient", label: "Recipient" },
  { key: "subject", label: "Subject" },
  { key: "booking", label: "Booking", mono: true },
  { key: "attemptedAt", label: "Attempted", mono: true },
  { key: "retries", label: "Retries", align: "right" },
];

export default function EmailLogsClient() {
  const [emailLogs, setEmailLogs] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [statusFilter, setStatusFilter] = useState("all");
  const [emailTypeFilter, setEmailTypeFilter] = useState("all");

  // Tracks which row (by EmailLog id) currently has a resend request
  // in flight, so only that row's button shows "Resending…" and gets
  // disabled — the rest of the table stays fully interactive.
  const [resendingLogId, setResendingLogId] = useState(null);

  const { toasts, showToast, dismissToast } = useToast();

  const fetchEmailLogs = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const params = new URLSearchParams({ page: String(page) });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (emailTypeFilter !== "all") params.set("emailType", emailTypeFilter);

      const response = await fetch(`/api/admin/email-logs?${params.toString()}`);
      const result = await parseJsonResponse(response);

      if (!result.success) {
        setLoadError(result.message || "Failed to load email logs. Please try again.");
        return;
      }

      setEmailLogs(result.data.emailLogs);
      setTotalPages(result.data.totalPages);
      setTotalCount(result.data.totalCount);
    } catch (error) {
      setLoadError(error.message || "We couldn't reach the server. Check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter, emailTypeFilter]);

  useEffect(() => {
    fetchEmailLogs();
  }, [fetchEmailLogs]);

  function handleStatusFilterChange(value) {
    setStatusFilter(value);
    setPage(1);
  }

  function handleEmailTypeFilterChange(event) {
    setEmailTypeFilter(event.target.value);
    setPage(1);
  }

  /**
   * handleResend
   * Sends the (possibly admin-edited) fields for one log row to the
   * resend route, then silently re-fetches the current page so the
   * brand-new attempt row shows up without a full reload.
   */
  async function handleResend(logId, fields) {
    setResendingLogId(logId);
    try {
      const response = await fetch(`/api/admin/email-logs/${logId}/resend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      const result = await parseJsonResponse(response);

      if (result.success) {
        showToast(`✓ ${result.message}`, "success");
      } else {
        showToast(`✕ ${result.message}`, "error");
      }

      await fetchEmailLogs();
    } catch (error) {
      showToast(`✕ ${error.message || "Failed to resend. Please try again."}`, "error");
    } finally {
      setResendingLogId(null);
    }
  }

  const rows = emailLogs.map(buildEmailLogRow);

  return (
    <section className="emailLogsSection">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <div className="emailLogsHeaderRow">
        <span className="emailLogsEyebrow">Email Delivery</span>
        <h1 className="emailLogsTitle">Email Logs</h1>
        <p className="emailLogsSubtitle">
          Every email this app has tried to send — booking notices, vault codes, security
          alerts, and more — shows up here as Sent or Failed. Expand a row to see why it
          failed and resend it with every field already filled in from the original attempt.
        </p>
      </div>

      <div className="emailLogsToolbar">
        <div className="emailLogsFilterRow">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              className={`emailLogsFilterPill${statusFilter === filter.value ? " emailLogsFilterPillActive" : ""}`}
              onClick={() => handleStatusFilterChange(filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="emailLogsSelectRow">
          <label className="emailLogsSelectLabel">
            Email Type
            <select className="emailLogsSelect" value={emailTypeFilter} onChange={handleEmailTypeFilterChange}>
              {EMAIL_TYPE_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        isLoading={isLoading}
        error={loadError}
        emptyMessage="No emails have been sent yet — this fills in automatically the first time one goes out."
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
        pageSize={20}
        onPageChange={setPage}
        renderExpandedRow={(row) => (
          <ResendForm log={row.raw} onResend={handleResend} isResending={resendingLogId === row.id} />
        )}
      />
    </section>
  );
}
