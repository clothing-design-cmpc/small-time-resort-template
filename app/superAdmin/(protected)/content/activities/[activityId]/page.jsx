/**
 * FILE: app/superAdmin/(protected)/content/activities/[activityId]/page.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Edit-activity route. Fetches the activity server-side (fresh, no
 * cache), then hands off to the shared ActivityForm in edit mode.
 * Calls notFound() if the activity ID doesn't exist.
 */
import { notFound } from "next/navigation";
import { prisma } from "@/services/prisma";
import ActivityForm from "../ActivityForm";

export async function generateMetadata({ params }) {
  const { activityId } = await params;
  const activity = await prisma.activity.findUnique({ where: { id: activityId } });
  return { title: activity ? `Edit ${activity.name} | Super-Admin` : "Activity Not Found | Super-Admin" };
}

export default async function EditActivityPage({ params }) {
  const { activityId } = await params;

  const activity = await prisma.activity.findUnique({ where: { id: activityId } });

  if (!activity) {
    notFound();
  }

  return <ActivityForm existingActivity={activity} />;
}
