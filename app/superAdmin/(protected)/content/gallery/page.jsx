/**
 * FILE: app/superAdmin/(protected)/content/gallery/page.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Gallery Management (blueprint Page 6). Lets the admin browse resort
 * photos by category tab, upload new images, reorder them, mark
 * featured images, and delete images.
 *
 * DATA FLOW:
 * 1. GalleryClient (Client Component) owns the actual data fetching
 *    via useGallery() since the grid needs live upload/reorder/delete
 *    behavior
 * 2. This file is the thin Server Component route entry — no data
 *    fetching happens here directly
 */
import "./Gallery.css";
import GalleryClient from "./GalleryClient";

export const metadata = {
  title: "Gallery | Super-Admin | your-private-resort",
};

export default function GalleryManagementPage() {
  return <GalleryClient />;
}
