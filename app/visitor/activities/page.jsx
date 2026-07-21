/**
 * FILE: app/visitor/activities/page.jsx
 * ROLE: Visitor — public, standalone page (same tier as /visitor/policies)
 *
 * PURPOSE:
 * Full resort activities listing. Previously this page did not exist
 * at all — the Activity table and its admin CRUD worked correctly,
 * but there was no way for a guest to see resort activities anywhere
 * on the live site.
 *
 * DATA FLOW:
 * 1. Visitor hits "/visitor/activities" (linked from the header nav and
 *    from the homepage's ActivitiesHighlightSection "View all
 *    activities" link)
 * 2. Server Component reads the Activity table directly via Prisma
 *    (same pattern app/visitor/policies/page.jsx already uses),
 *    scoped to isActive activities, ordered by sortOrder — no client
 *    interactivity needed, so no separate Client Component required
 */
import Image from "next/image";
import { prisma } from "@/services/prisma";
import "./Activities.css";

export const metadata = {
  title: "Activities | Villa Azure Resort",
  description: "Ways to spend your time at Villa Azure Resort, from quiet to active.",
};

export default async function VisitorActivitiesPage() {
  const activities = await prisma.activity
    .findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    })
    .catch(() => []);

  return (
    <main className="activitiesPageMain">
      <div className="activitiesPageHeader">
        <span className="activitiesPageEyebrow">Things To Do</span>
        <h1 className="activitiesPageTitle">Resort Activities</h1>
        <p className="activitiesPageSubtitle">
          A few ways to fill the quiet hours — or not, that&apos;s fine too.
        </p>
      </div>

      {/* Empty state — no active activities yet (Rule 25.3) */}
      {activities.length === 0 && (
        <div className="activitiesPageEmptyState">
          <p className="activitiesPageEmptyTitle">No activities listed yet.</p>
          <p className="activitiesPageEmptySubtitle">Check back soon — we&apos;re always adding more ways to spend your stay.</p>
        </div>
      )}

      {activities.length > 0 && (
        <div className="activitiesPageGrid">
          {activities.map((activity) => (
            <article key={activity.id} className="activityPageCard">
              <div className="activityPageImageWrapper">
                {activity.imageUrl ? (
                  <Image
                    src={activity.imageUrl}
                    alt={activity.name}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="activityPageImage"
                  />
                ) : (
                  <div className="activityPageImagePlaceholder" aria-hidden="true" />
                )}
              </div>
              <div className="activityPageBody">
                <h2 className="activityPageName">{activity.name}</h2>
                {activity.description && <p className="activityPageDescription">{activity.description}</p>}
                <div className="activityPageMeta">
                  {activity.duration && <span className="activityPageMetaItem">{activity.duration}</span>}
                  <span className="activityPageMetaItem">
                    {activity.minGroupSize}–{activity.maxGroupSize} guests
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
