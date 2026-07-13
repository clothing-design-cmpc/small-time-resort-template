/**
 * FILE: app/page.jsx
 * ROLE: Root entry point — no account type of its own
 *
 * PURPOSE:
 * The project currently has only one account type (visitor), so this
 * always redirects there. Once member/admin accounts are added, this
 * should read the session cookie and redirect based on role instead
 * of redirecting unconditionally.
 */
import { redirect } from "next/navigation";

export default function RootPage() {
  // Only the visitor account type exists right now — send everyone there
  redirect("/visitor");
}
