/**
 * FILE: app/superAdmin/(protected)/content/activities/new/page.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Create-activity route. Hands off to the shared ActivityForm in
 * create mode.
 */
import ActivityForm from "../ActivityForm";

export const metadata = {
  title: "Add Activity | Super-Admin | Villa Azure Resort",
};

export default function NewActivityPage() {
  return <ActivityForm existingActivity={null} />;
}
