/**
 * FILE: app/superAdmin/(protected)/gatekeeper-tester/page.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Thin Server Component wrapper — the IP inputs, run trigger, and
 * results list are all interactive, so they live in the Client
 * Component (GatekeeperTesterClient).
 */
import GatekeeperTesterClient from "./GatekeeperTesterClient";
import "./GatekeeperTester.css";

export const metadata = {
  title: "Gatekeeper Tester | Super-Admin",
};

export default function GatekeeperTesterPage() {
  return <GatekeeperTesterClient />;
}
