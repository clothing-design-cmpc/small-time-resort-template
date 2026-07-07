/**
 * FILE: components/superAdmin/StatCard.jsx
 * ROLE: Super-admin — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Single KPI card used in the dashboard's top stat row (and any future
 * admin page that needs an at-a-glance metric). Shows a label, a big
 * number, and a trend indicator versus last month.
 *
 * DATA FLOW:
 * 1. Rendered by app/superAdmin/dashboard/page.jsx, one per STAT_CARDS entry
 * 2. Purely presentational — all values come in as props, no fetching here
 */
import "./StatCard.css";

export default function StatCard({ label, value, trend, trendDirection }) {
  return (
    <article className="statCard">
      <span className="statCardLabel">{label}</span>
      <span className="statCardValue">{value}</span>
      {/* Trend arrow flips direction and color based on whether the metric improved or dropped */}
      <span className={`statCardTrend statCardTrend--${trendDirection}`}>
        {trendDirection === "up" ? "↑" : "↓"} {trend} vs last month
      </span>
    </article>
  );
}
