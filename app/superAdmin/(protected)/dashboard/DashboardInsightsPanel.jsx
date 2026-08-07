/**
 * FILE: app/superAdmin/(protected)/dashboard/DashboardInsightsPanel.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Groups the AI Sales Insight, Weather Forecast Cache, and Marketing
 * Insights widgets into one tabbed panel instead of three separate
 * full-width cards stacked in a long scroll. Design pass requested by
 * the developer: "simple, elegant, indi sila mabubulunan sa
 * informations" — same three widgets, same data, just one visible
 * at a time instead of all three competing for attention at once.
 *
 * DATA FLOW:
 * 1. All three child widgets (AiInsightWidgetClient, WeatherCacheWidgetClient,
 *    MarketingInsightsClient) are mounted together on page load, exactly
 *    as before — this preserves their existing fetch-on-mount behavior
 *    (useAiInsight/useWeatherCache/useMarketingInsights all still fire
 *    immediately, so switching tabs never triggers a fresh fetch or a
 *    loading flash for data that already loaded).
 * 2. Only the active tab's child is visually shown (CSS display swap
 *    via .dashboardTabBody--hidden) — the other two stay mounted but
 *    hidden, not unmounted.
 * 3. activeTab is local UI state — never persisted, always resets to
 *    "ai" on a fresh page load.
 */
"use client";

import { useState } from "react";
import AiInsightWidgetClient from "./AiInsightWidgetClient";
import WeatherCacheWidgetClient from "./WeatherCacheWidgetClient";
import MarketingInsightsClient from "./MarketingInsightsClient";

const TABS = [
  { key: "ai", label: "AI Insight" },
  { key: "weather", label: "Weather" },
  { key: "marketing", label: "Marketing" },
];

export default function DashboardInsightsPanel() {
  const [activeTab, setActiveTab] = useState("ai");

  return (
    <section className="dashboardInsightsPanel">
      <div className="dashboardTabRow" role="tablist" aria-label="Dashboard insights">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            className={`dashboardTabButton${activeTab === tab.key ? " dashboardTabButton--active" : ""}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Each body stays mounted at all times (see file header) — only
          visibility toggles, so no widget ever refetches on tab switch. */}
      <div className={`dashboardTabBody${activeTab !== "ai" ? " dashboardTabBody--hidden" : ""}`}>
        <AiInsightWidgetClient />
      </div>
      <div className={`dashboardTabBody${activeTab !== "weather" ? " dashboardTabBody--hidden" : ""}`}>
        <WeatherCacheWidgetClient />
      </div>
      <div className={`dashboardTabBody${activeTab !== "marketing" ? " dashboardTabBody--hidden" : ""}`}>
        <MarketingInsightsClient />
      </div>
    </section>
  );
}
