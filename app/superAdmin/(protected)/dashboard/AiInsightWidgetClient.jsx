/**
 * FILE: app/superAdmin/(protected)/dashboard/AiInsightWidgetClient.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Dashboard card showing the latest daily AI Sales Insight
 * (villa-azure-ai-insight-and-directions-plan.txt, Part 1). Runs
 * automatically once a day via Vercel Cron
 * (app/api/cron/ai-insight/route.js), but the owner can also force a
 * fresh one on demand — the plan's hybrid approach.
 *
 * DATA FLOW:
 * 1. useAiInsight() fetches GET /api/admin/ai-insight on mount
 * 2. Handles the three required states per Rule 25: loading skeleton,
 *    error with retry, and empty ("no insight generated yet")
 * 3. "Regenerate now" POSTs /api/admin/ai-insight/regenerate and
 *    swaps in the fresh result, with a toast either way
 */
"use client";

import { useAiInsight } from "@/hooks/useAiInsight";
import StatusBadge from "@/components/superAdmin/StatusBadge";
import { useToast } from "@/app/superAdmin/shared/useToast";
import ToastStack from "@/app/superAdmin/shared/ToastStack";

/**
 * formatRelativeTime
 * "Generated 3 hours ago" style label, per the plan's HIGH-LEVEL FLOW
 * step 4 — the widget always shows how stale the current insight is,
 * since a same-looking observation from yesterday reads very
 * differently than one from five minutes ago.
 */
function formatRelativeTime(dateString) {
  const generatedAt = new Date(dateString);
  const diffMinutes = Math.round((Date.now() - generatedAt.getTime()) / (1000 * 60));

  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

export default function AiInsightWidgetClient() {
  const { insight, isLoading, isRegenerating, error, refetchInsight, regenerate } = useAiInsight();
  const { toasts, showToast, dismissToast } = useToast();

  async function handleRegenerate() {
    const result = await regenerate();
    showToast(result.success ? `✓ ${result.message}` : `✕ ${result.message}`, result.success ? "success" : "error");
  }

  return (
    <section className="aiInsightWidget">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <div className="aiInsightHeaderRow">
        <div>
          <span className="aiInsightEyebrow">AI SALES INSIGHT</span>
          <h2 className="aiInsightTitle">Today&apos;s Read on the Business</h2>
        </div>
        <button
          type="button"
          className="aiInsightRegenerateButton"
          onClick={handleRegenerate}
          disabled={isRegenerating || isLoading}
        >
          {isRegenerating ? "Regenerating…" : "Regenerate now"}
        </button>
      </div>

      {isLoading && (
        <div className="aiInsightSkeleton">
          <div className="skeletonBlock aiInsightSkeletonLine" />
          <div className="skeletonBlock aiInsightSkeletonLine" />
          <div className="skeletonBlock aiInsightSkeletonLineShort" />
        </div>
      )}

      {!isLoading && error && (
        <div className="aiInsightErrorState">
          <p>Failed to load the latest insight. Please try again.</p>
          <button type="button" className="aiInsightRetryButton" onClick={refetchInsight}>
            Retry
          </button>
        </div>
      )}

      {!isLoading && !error && !insight && (
        <div className="aiInsightEmptyState">
          <p>No insight has been generated yet. The first one runs automatically at 6:00 AM, or click &ldquo;Regenerate now&rdquo; above.</p>
        </div>
      )}

      {!isLoading && !error && insight && (
        <div className="aiInsightBody">
          <div className="aiInsightMetaRow">
            <StatusBadge status={insight.severity} />
            <span className="aiInsightTimestamp">Generated {formatRelativeTime(insight.generatedAt)}</span>
            <span className="aiInsightTriggerTag">{insight.triggerSource === "manual" ? "Manual" : "Automatic"}</span>
          </div>

          {insight.status === "insufficient_data" ? (
            <p className="aiInsightInsufficientData">
              Not enough recent booking activity yet for a reliable insight — check back once there&apos;s more data.
            </p>
          ) : insight.status === "error" ? (
            <p className="aiInsightInsufficientData">{insight.observation}</p>
          ) : (
            <dl className="aiInsightFieldList">
              <dt>Observation</dt>
              <dd>{insight.observation}</dd>
              <dt>Likely Cause</dt>
              <dd>{insight.likelyCause}</dd>
              <dt>Suggested Action</dt>
              <dd>{insight.suggestedAction}</dd>
            </dl>
          )}
        </div>
      )}
    </section>
  );
}
