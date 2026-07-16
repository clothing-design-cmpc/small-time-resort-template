/**
 * FILE: components/superAdmin/BreachAlertBanner.jsx
 * ROLE: Super-admin only — protected by proxy.js auth guard
 *
 * PURPOSE:
 * Persistent red banner shown at the top of every super-admin page
 * while a gatekeeper breach is active and unresolved. This is the
 * "alert super-admin" half of the breach response (services/
 * breachResponse.js also sends an email — this is the in-app half,
 * guaranteed to be seen the moment the admin next signs in, even if
 * the email lands in spam or SMS wasn't configured).
 *
 * DATA FLOW:
 * 1. Mounted once in app/superAdmin/(protected)/layout.jsx, so it's
 *    present on every authenticated admin page without duplicating logic
 * 2. GET /api/admin/breach?bannerOnly=true on mount — same endpoint the
 *    hidden recovery page reads from (without the query param), but
 *    this trimmed variant skips the separate vault-passphrase gate
 *    (services/vaultAuth.js) since every super-admin needs to see the
 *    red banner, not just one who has already unlocked the vault. The
 *    response also carries the CURRENT vaultRecoveryPath — never
 *    hardcoded here, since it changes on every passphrase rotation.
 * 3. The link below points at the hidden recovery page's own login
 *    screen — opening it still requires the vault passphrase, this
 *    banner only reveals which gatekeeper tripped, nothing sensitive
 */
"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import "./BreachAlertBanner.css";

const GATEKEEPER_LABELS = {
  1: "Gatekeeper 1 — Login brute force",
  2: "Gatekeeper 2 — SQL injection attempt",
  3: "Gatekeeper 3 — Anomalous admin login",
};

export default function BreachAlertBanner() {
  const [activeBreach, setActiveBreach] = useState(null);
  const [vaultRecoveryPath, setVaultRecoveryPath] = useState(null);

  useEffect(() => {
    axios
      .get("/api/admin/breach?bannerOnly=true")
      .then((response) => {
        if (response.data?.data?.breachLockdown) {
          setActiveBreach(response.data.data.activeBreach);
          setVaultRecoveryPath(response.data.data.vaultRecoveryPath);
        }
      })
      .catch(() => {
        // Best-effort — a failed status check must never break the admin panel itself.
      });
  }, []);

  if (!activeBreach) return null;

  return (
    <div className="breachAlertBanner" role="alert">
      <span className="breachAlertBannerIcon" aria-hidden="true">⚠</span>
      <div className="breachAlertBannerText">
        <strong>Security breach detected — the website is locked down.</strong>
        <span>
          {GATEKEEPER_LABELS[activeBreach.gatekeeper] ?? `Gatekeeper ${activeBreach.gatekeeper}`} tripped.{" "}
          {vaultRecoveryPath ? (
            <a href={vaultRecoveryPath}>Open the recovery page</a>
          ) : (
            "Open the recovery page from your email alert"
          )}{" "}
          to review and restore.
        </span>
      </div>
    </div>
  );
}
