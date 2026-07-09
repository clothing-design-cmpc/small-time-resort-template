/**
 * FILE: app/superAdmin/(protected)/content/testimonials/page.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Testimonials Management (blueprint Page 5). Lists every guest
 * testimonial with rating, quote preview, and featured state, and
 * lets the admin create, edit, or delete testimonials via a modal.
 *
 * DATA FLOW:
 * 1. TestimonialsListClient (Client Component) owns the actual data
 *    fetching via useTestimonials() since the list needs live
 *    create/edit/delete/refetch behavior
 * 2. This file is the thin Server Component route entry — no data
 *    fetching happens here directly
 */
import "./Testimonials.css";
import TestimonialsListClient from "./TestimonialsListClient";

export const metadata = {
  title: "Testimonials | Super-Admin | Villa Azure Resort",
};

export default function TestimonialsManagementPage() {
  return <TestimonialsListClient />;
}
