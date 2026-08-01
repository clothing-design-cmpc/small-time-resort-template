/**
 * FILE: app/superAdmin/(protected)/dashboard/WeatherCacheWidgetClient.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Dashboard card showing the cached homepage weather forecast. Runs
 * automatically 3x/day via Vercel Cron (app/api/cron/weather/route.js
 * — 5AM/12PM/8PM Asia/Manila), but the owner can also force a fresh
 * pull on demand — same hybrid pattern as AiInsightWidgetClient.jsx.
 * This is also the practical way to populate the cache during local
 * dev, since Vercel Cron never fires on localhost.
 *
 * DATA FLOW:
 * 1. useWeatherCache() fetches GET /api/admin/weather on mount
 * 2. Handles the three required states per Rule 25: loading skeleton,
 *    error with retry, and empty ("no forecast cached yet")
 * 3. "Refresh now" POSTs /api/admin/weather/refresh and refetches the
 *    resulting cache row, with a toast either way
 */
"use client";

import { useWeatherCache } from "@/hooks/useWeatherCache";
import { useToast } from "@/app/superAdmin/shared/useToast";
import ToastStack from "@/app/superAdmin/shared/ToastStack";

/**
 * formatRelativeTime
 * "Refreshed 3 hours ago" style label — same helper pattern
 * AiInsightWidgetClient.jsx uses, so an admin can tell a stale cache
 * (missed cron run) apart from a fresh one at a glance.
 */
function formatRelativeTime(dateString) {
  const updatedAt = new Date(dateString);
  const diffMinutes = Math.round((Date.now() - updatedAt.getTime()) / (1000 * 60));

  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

export default function WeatherCacheWidgetClient() {
  const { cache, isLoading, isRefreshing, error, refetchCache, refresh } = useWeatherCache();
  const { toasts, showToast, dismissToast } = useToast();

  async function handleRefresh() {
    const result = await refresh();
    showToast(result.success ? `✓ ${result.message}` : `✕ ${result.message}`, result.success ? "success" : "error");
  }

  const forecastDays = Array.isArray(cache?.forecastDays) ? cache.forecastDays : [];
  const hasForecast = cache?.status === "ok" && forecastDays.length > 0;

  return (
    <section className="weatherCacheWidget">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <div className="weatherCacheHeaderRow">
        <div>
          <span className="weatherCacheEyebrow">HOMEPAGE WIDGET</span>
          <h2 className="weatherCacheTitle">Weather Forecast Cache</h2>
        </div>
        <button
          type="button"
          className="weatherCacheRefreshButton"
          onClick={handleRefresh}
          disabled={isRefreshing || isLoading}
        >
          {isRefreshing ? "Refreshing…" : "Refresh now"}
        </button>
      </div>

      {isLoading && (
        <div className="weatherCacheSkeleton">
          <div className="skeletonBlock weatherCacheSkeletonLine" />
          <div className="skeletonBlock weatherCacheSkeletonLineShort" />
        </div>
      )}

      {!isLoading && error && (
        <div className="weatherCacheErrorState">
          <p>Failed to load the weather cache. Please try again.</p>
          <button type="button" className="weatherCacheRetryButton" onClick={refetchCache}>
            Retry
          </button>
        </div>
      )}

      {!isLoading && !error && !hasForecast && (
        <div className="weatherCacheEmptyState">
          <p>
            No forecast cached yet. It refreshes automatically at 5:00 AM, 12:00 PM, and 8:00 PM, or click
            &ldquo;Refresh now&rdquo; above.
          </p>
        </div>
      )}

      {!isLoading && !error && hasForecast && (
        <div className="weatherCacheBody">
          <span className="weatherCacheTimestamp">Refreshed {formatRelativeTime(cache.updatedAt)}</span>
          <div className="weatherCacheDayList">
            {forecastDays.map((day, index) => (
              <div key={day.date ?? index} className="weatherCacheDayRow">
                <span className="weatherCacheDayDate">{day.date}</span>
                <span className="weatherCacheDayCondition">{day.conditionText}</span>
                <span className="weatherCacheDayTemps">
                  {day.maxTemp != null ? `${Math.round(day.maxTemp)}°` : "—"} /{" "}
                  {day.minTemp != null ? `${Math.round(day.minTemp)}°` : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
