/**
 * FILE: app/superAdmin/(protected)/content/rooms/RoomsListClient.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Renders the Rooms Management list: header + "Add Room" button, the
 * DataTable of rooms, a delete confirmation modal, and the toast stack.
 *
 * DATA FLOW:
 * 1. useRooms() fetches all rooms on mount
 * 2. Clicking a row navigates to the edit page for that room
 * 3. Clicking "Delete" opens ConfirmationModal; confirming calls
 *    deleteRoom() then shows a success/error toast
 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useRooms } from "@/hooks/useRooms";
import { useToast } from "@/app/superAdmin/shared/useToast";
import ToastStack from "@/app/superAdmin/shared/ToastStack";
import DataTable from "@/components/superAdmin/DataTable";
import StatusBadge from "@/components/superAdmin/StatusBadge";
import ConfirmationModal from "@/components/superAdmin/ConfirmationModal";

export default function RoomsListClient() {
  const router = useRouter();
  const { rooms, isLoading, error, deleteRoom } = useRooms();
  const { toasts, showToast, dismissToast } = useToast();

  // Tracks which room is pending deletion so ConfirmationModal knows
  // what to show and what to delete when confirmed.
  const [roomPendingDelete, setRoomPendingDelete] = useState(null);

  async function handleConfirmDelete() {
    try {
      await deleteRoom(roomPendingDelete.id);
      showToast(`✓ "${roomPendingDelete.name}" deleted successfully.`, "success");
    } catch {
      showToast("✕ Failed to delete room.", "error");
    } finally {
      setRoomPendingDelete(null);
    }
  }

  const columns = [
    { key: "name", label: "Room Name" },
    { key: "price", label: "Price / Night", align: "right", mono: true },
    { key: "guests", label: "Max Guests", align: "center" },
    { key: "featured", label: "Featured?", align: "center" },
    { key: "status", label: "Active?", align: "center" },
    { key: "actions", label: "Actions", align: "right" },
  ];

  const rows = rooms.map((room) => ({
    id: room.id,
    name: room.name,
    price: `₱${Number(room.pricePerNight).toLocaleString()}`,
    guests: room.capacity,
    featured: room.isFeatured ? "Yes" : "—",
    status: <StatusBadge status={room.isActive ? "active" : "suspended"} />,
    actions: (
      <div className="roomsRowActions">
        <Link
          href={`/superAdmin/content/rooms/${room.id}`}
          className="roomsRowActionButton"
          onClick={(event) => event.stopPropagation()}
        >
          Edit
        </Link>
        <button
          type="button"
          className="roomsRowActionButton roomsRowActionButton--destructive"
          onClick={(event) => {
            event.stopPropagation();
            setRoomPendingDelete(room);
          }}
        >
          Delete
        </button>
      </div>
    ),
  }));

  return (
    <section className="roomsSection">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <div className="roomsHeaderRow">
        <div>
          <span className="roomsEyebrow">Content Management</span>
          <h1 className="roomsTitle">Rooms</h1>
        </div>
        <Link href="/superAdmin/content/rooms/new" className="roomsAddButton">
          + Add Room
        </Link>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        isLoading={isLoading}
        error={error}
        emptyMessage="No rooms yet. Click “Add Room” to create the first one."
        onRowClick={(row) => router.push(`/superAdmin/content/rooms/${row.id}`)}
      />

      <ConfirmationModal
        isOpen={Boolean(roomPendingDelete)}
        title="Delete Room?"
        description={
          roomPendingDelete
            ? `Are you sure you want to delete "${roomPendingDelete.name}"? This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        onConfirm={handleConfirmDelete}
        onCancel={() => setRoomPendingDelete(null)}
      />
    </section>
  );
}
