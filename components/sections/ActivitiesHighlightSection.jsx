/**
 * FILE: components/sections/ActivitiesHighlightSection.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Homepage teaser showing a handful of resort activities, with a link
 * through to the full /visitor/activities page.
 *
 * DATA FLOW:
 * 1. Rendered inside app/visitor/page.jsx after TestimonialsSection
 * 2. Server Component reads the Activity table directly via Prisma
 *    (same pattern app/visitor/policies/page.jsx already uses), scoped
 *    to isActive activities, ordered by sortOrder — same query as the
 *    full /visitor/activities page (no featured-only filter, no cap)
 *    so every active activity an admin adds shows up here too, not
 *    just the first 3 marked featured
 * 3. Fails safe to an empty array — the section renders nothing rather
 *    than a broken/empty grid if no activities exist yet
 */
import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/services/prisma";
import "./ActivitiesHighlightSection.css";

export default async function ActivitiesHighlightSection() {
  // Same query as the full activities page — every active activity,
  // no featured-only filter and no cap, so the homepage strip is never
  // missing activities the full page shows.
  const activities = await prisma.activity
    .findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    })
    .catch(() => []);

  // Nothing to show yet — admin hasn't added any activities.
  if (activities.length === 0) return null;

  return (
    <section className="activitiesHighlightSection" id="activities">
      <div className="activitiesHighlightContainer">
        <div className="activitiesHighlightHeader">
          <span className="activitiesHighlightEyebrow">Things To Do</span>
          <h2 className="activitiesHighlightTitle">Resort Activities</h2>
          <p className="activitiesHighlightSubtitle">
            A few ways to fill the quiet hours — or not, that&apos;s fine too.
          </p>
        </div>

        <div className="activitiesHighlightGrid">
          {activities.map((activity) => (
            <article key={activity.id} className="activityHighlightCard">
              <div className="activityHighlightImageWrapper">
                {activity.imageUrl ? (
                  <Image
                    src={activity.imageUrl}
                    alt={activity.name}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="activityHighlightImage"
                  />
                ) : (
                  <div className="activityHighlightImagePlaceholder" aria-hidden="true" />
                )}
              </div>
              <div className="activityHighlightBody">
                <h3 className="activityHighlightName">{activity.name}</h3>
                {activity.description && (
                  <p className="activityHighlightDescription">{activity.description}</p>
                )}
                <div className="activityHighlightMeta">
                  {activity.duration && <span className="activityHighlightMetaItem">{activity.duration}</span>}
                  <span className="activityHighlightMetaItem">
                    {activity.minGroupSize}–{activity.maxGroupSize} guests
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>

        <div className="activitiesHighlightViewAll">
          <Link href="/visitor/activities" className="activitiesHighlightViewAllLink">
            View all activities →
          </Link>
        </div>
      </div>
    </section>
  );
}
