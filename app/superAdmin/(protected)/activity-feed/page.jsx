/**
 * FILE: app/superAdmin/(protected)/activity-feed/page.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Activity Feed — one merged, newest-first timeline of everything that
 * happened on the site: anonymous visitor traffic (VisitorLog) and
 * logged-in staff actions (AccountActivityLog), with a filter to
 * narrow to just one source. The two source pages (Visitor Logs,
 * Account Activity) still exist for focused, single-source review —
 * this page is the "show me everything together" view on top of them.
 *
 * DATA FLOW:
 * 1. ActivityFeedClient (Client Component) owns the data fetching
 *    since the feed needs live page/filter changes
 * 2. This file is the thin Server Component route entry — no data
 *    fetching happens here directly
 */
import "./ActivityFeed.css";
import ActivityFeedClient from "./ActivityFeedClient";

export const metadata = {
  title: "Activity Feed | Super-Admin | Villa Azure Resort",
};

export default function ActivityFeedPage() {
  return <ActivityFeedClient />;
}
