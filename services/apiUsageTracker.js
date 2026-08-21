/**
 * FILE: services/apiUsageTracker.js
 * PURPOSE:
 * Central logging service for every outbound call this app makes to a
 * metered third-party API, plus the catalog of which APIs exist, what
 * they're used for, their known free-tier quota, and a direct link to
 * that provider's own usage dashboard (the only place the REAL current
 * usage number can be checked — this app only counts the calls it made
 * itself, it can never see quota already consumed before this table
 * existed, or by any other project sharing the same API key).
 *
 * Same never-break-the-request pattern as services/securityLog.js:
 * every write is wrapped in try/catch and only ever console.error's on
 * failure — a logging failure must never fail the real API call it's
 * recording.
 *
 * DATA FLOW:
 * 1. Each service file (weather.js, directions.js, aiInsight.js,
 *    github.js, emailjs.js, r2.js) calls
 *    recordApiCall() right after its own fetch/SDK call resolves —
 *    success or failure both get logged, so a string of failures is
 *    visible on the usage page too, not just successful calls.
 * 2. app/api/admin/api-usage/route.js reads and aggregates ApiCallLog
 *    rows for the API Usage page.
 */
// Relative import, NOT the "@/" Next.js alias — this file is imported
// (via r2.js) by scripts/runBackup.js, which runs under plain `node`,
// not Next.js's bundler. See services/r2.js's own import comment for
// the full reasoning.
import { prisma } from "./prisma.js";

/**
 * API_CATALOG
 * One entry per service key used in ApiCallLog.service. This is the
 * single source of truth for the API Usage page's cards — label,
 * which file(s) call it, the known free-tier quota (informational
 * only, never enforced here), and the link to that provider's own
 * dashboard where the real, authoritative usage number lives.
 */
export const API_CATALOG = {
  google_weather: {
    label: "Google Weather API",
    usedBy: "services/weather.js",
    quotaNote: "10,000 calls/month on the free tier",
    dashboardUrl: "https://console.cloud.google.com/google/maps-apis/api-list",
  },
  google_maps: {
    label: "Google Maps Platform (Geocoding, Routes, Static Maps)",
    usedBy: "services/directions.js",
    quotaNote: "Shares a $200/month free credit pool across all three APIs",
    dashboardUrl: "https://console.cloud.google.com/google/maps-apis/metrics",
  },
  gemini: {
    label: "Gemini API",
    usedBy: "services/aiInsight.js",
    quotaNote: "Free tier — per-minute and per-day request limits, varies by model",
    dashboardUrl: "https://aistudio.google.com/usage",
  },
  gemini_search_grounding: {
    label: "Gemini API (Google Search grounding)",
    usedBy: "services/aiInsight.js",
    quotaNote: "Shares the Gemini free-tier request limits; grounded calls also draw from a separate free daily search-grounding quota",
    dashboardUrl: "https://aistudio.google.com/usage",
  },
  github: {
    label: "GitHub REST API",
    usedBy: "services/github.js",
    quotaNote: "5,000 requests/hour per authenticated token",
    dashboardUrl: "https://github.com/settings/tokens",
  },
  emailjs: {
    label: "EmailJS",
    usedBy: "services/emailjs.js, services/emailAlert.js",
    quotaNote: "200 emails/month on the Free plan",
    dashboardUrl: "https://dashboard.emailjs.com/admin",
  },
  cloudflare_r2: {
    label: "Cloudflare R2",
    usedBy: "services/r2.js",
    quotaNote: "~10GB storage + 1M Class A / 10M Class B operations/month on the free tier",
    dashboardUrl: "https://dash.cloudflare.com/?to=/:account/r2/overview",
  },
  google_drive: {
    label: "Google Drive API",
    usedBy: "services/googleDrive.js",
    quotaNote: "Free — subject to per-user/per-100s request quotas on the Drive API",
    dashboardUrl: "https://console.cloud.google.com/apis/api/drive.googleapis.com/quotas",
  },
  supabase: {
    label: "Supabase",
    usedBy: "services/supabase.js, services/prisma.js",
    quotaNote: "Plan-based — database size, bandwidth, and monthly active users",
    dashboardUrl: "https://supabase.com/dashboard/project/_/settings/billing/usage",
  },
};

/**
 * recordApiCall
 * Writes one ApiCallLog row. Never throws — a failed write is logged
 * to the server console and swallowed so it can never take down the
 * real API call it's tracking.
 *
 * @param {string} service  - must be one of API_CATALOG's keys
 * @param {string|null} endpoint - short label for which call within
 *   that service, e.g. "forecast_lookup", "geocode", "generate_content"
 * @param {boolean} success - whether the underlying call succeeded
 */
export async function recordApiCall(service, endpoint = null, success = true) {
  try {
    await prisma.apiCallLog.create({
      data: { service, endpoint, success },
    });
  } catch (error) {
    console.error("[apiUsageTracker] Failed to write:", error.message);
  }
}
