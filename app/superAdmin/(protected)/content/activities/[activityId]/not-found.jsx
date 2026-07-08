/**
 * FILE: app/superAdmin/(protected)/content/activities/[activityId]/not-found.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Shown when EditActivityPage calls notFound() for an activity ID
 * that no longer exists (deleted, or a stale/bad link).
 */
import Link from "next/link";
import "../Activities.css";

export default function ActivityNotFound() {
  return (
    <section className="activitiesSection">
      <h1 className="activitiesTitle">Activity Not Found</h1>
      <p>We couldn&apos;t find what you&apos;re looking for. It may have been deleted.</p>
      <Link href="/superAdmin/content/activities" className="activitiesAddButton">
        Back to Activities
      </Link>
    </section>
  );
}
