/**
 * FILE: app/superAdmin/(protected)/content/activities/ActivitiesListClient.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Renders the Activities Management list: header + "Add Activity"
 * button, the DataTable of activities, a delete confirmation modal,
 * and the toast stack.
 *
 * DATA FLOW:
 * 1. useActivities() fetches all activities on mount
 * 2. Clicking a row navigates to the edit page for that activity
 * 3. Clicking "Delete" opens ConfirmationModal; confirming calls
 *    deleteActivity() then shows a success/error toast
 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useActivities } from "@/hooks/useActivities";
import { useToast } from "@/app/superAdmin/shared/useToast";
import ToastStack from "@/app/superAdmin/shared/ToastStack";
import DataTable from "@/components/superAdmin/DataTable";
import StatusBadge from "@/components/superAdmin/StatusBadge";
import ConfirmationModal from "@/components/superAdmin/ConfirmationModal";

export default function ActivitiesListClient() {
  const router = useRouter();
  const { activities, isLoading, error, deleteActivity } = useActivities();
  const { toasts, showToast, dismissToast } = useToast();

  // Tracks which activity is pending deletion so ConfirmationModal
  // knows what to show and what to delete when confirmed.
  const [activityPendingDelete, setActivityPendingDelete] = useState(null);

  async function handleConfirmDelete() {
    try {
      await deleteActivity(activityPendingDelete.id);
      showToast(`✓ "${activityPendingDelete.name}" deleted successfully.`, "success");
    } catch {
      showToast("✕ Failed to delete activity.", "error");
    } finally {
      setActivityPendingDelete(null);
    }
  }

  const columns = [
    { key: "name", label: "Activity Name" },
    { key: "duration", label: "Duration", align: "center" },
    { key: "maxGroup", label: "Max Group", align: "center" },
    { key: "featured", label: "Featured?", align: "center" },
    { key: "status", label: "Active?", align: "center" },
    { key: "actions", label: "Actions", align: "right" },
  ];

  const rows = activities.map((activity) => ({
    id: activity.id,
    name: activity.name,
    duration: activity.duration || "—",
    maxGroup: activity.maxGroupSize,
    featured: activity.isFeatured ? "Yes" : "—",
    status: <StatusBadge status={activity.isActive ? "active" : "suspended"} />,
    actions: (
      <div className="activitiesRowActions">
        <Link
          href={`/superAdmin/content/activities/${activity.id}`}
          className="activitiesRowActionButton"
          onClick={(event) => event.stopPropagation()}
        >
          Edit
        </Link>
        <button
          type="button"
          className="activitiesRowActionButton activitiesRowActionButton--destructive"
          onClick={(event) => {
            event.stopPropagation();
            setActivityPendingDelete(activity);
          }}
        >
          Delete
        </button>
      </div>
    ),
  }));

  return (
    <section className="activitiesSection">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <div className="activitiesHeaderRow">
        <div>
          <span className="activitiesEyebrow">Content Management</span>
          <h1 className="activitiesTitle">Activities</h1>
        </div>
        <Link href="/superAdmin/content/activities/new" className="activitiesAddButton">
          + Add Activity
        </Link>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        isLoading={isLoading}
        error={error}
        emptyMessage="No activities yet. Click “Add Activity” to create the first one."
        onRowClick={(row) => router.push(`/superAdmin/content/activities/${row.id}`)}
      />

      <ConfirmationModal
        isOpen={Boolean(activityPendingDelete)}
        title="Delete Activity?"
        description={
          activityPendingDelete
            ? `Are you sure you want to delete "${activityPendingDelete.name}"? This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        onConfirm={handleConfirmDelete}
        onCancel={() => setActivityPendingDelete(null)}
      />
    </section>
  );
}
