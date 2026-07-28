/**
 * FILE: app/superAdmin/(protected)/content/rooms/page.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Rooms Management (blueprint Page 1). Lists every room with price,
 * max guests, featured/active state, and row actions to edit or delete.
 * "Add Room" links to the create form.
 *
 * DATA FLOW:
 * 1. RoomsListClient (Client Component) owns the actual data fetching
 *    via useRooms() since the list needs live delete/refetch behavior
 * 2. This file is the thin Server Component route entry — no data
 *    fetching happens here directly
 */
import "./Rooms.css";
import RoomsListClient from "./RoomsListClient";

export const metadata = {
  title: "Rooms | Super-Admin | your-private-resort",
};

export default function RoomsManagementPage() {
  return <RoomsListClient />;
}
