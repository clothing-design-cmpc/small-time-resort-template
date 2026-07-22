/**
 * FILE: app/system-vault/[vaultSlug]/RotateVaultUrlSection.jsx
 * ROLE: Standalone — rendered inside VaultDangerZoneSection.jsx only
 *
 * PURPOSE:
 * Task 5 — "Rotating vault slug", independent of the passphrase.
 * Lets the owner force a brand-new recovery URL on its own — for the
 * case where the link itself may have leaked (shared over an
 * insecure channel, sitting in a proxy/browser history log) but the
 * passphrase is still believed safe — without burning a good
 * passphrase or making everyone re-memorize a new one.
 *
 * No step-up code required here (unlike the wipe actions above it in
 * the Danger Zone): this can't destroy or expose data on its own, and
 * the confirmation modal already guards against an accidental click.
 *
 * DATA FLOW:
 * 1. Owner clicks "Rotate Recovery URL", confirms the modal
 * 2. POST /api/admin/rotate-vault-url -> new slug is live immediately;
 *    the CURRENT slug (this very page) starts 404ing from this point on
 * 3. Response includes the new path -> router.push() there right away,
 *    so the owner is never stranded on a dead URL mid-session
 * 4. New URL is also emailed to the vault owner (server-side, best-
 *    effort) — the toast on the new page reminds them to check email
 *    in case the redirect itself somehow doesn't land
 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ConfirmationModal from "@/components/superAdmin/ConfirmationModal";

export default function RotateVaultUrlSection({ showToast }) {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRotating, setIsRotating] = useState(false);

  async function handleConfirmRotate() {
    setIsRotating(true);
    try {
      const response = await fetch("/api/admin/rotate-vault-url", { method: "POST" });
      const result = await response.json();

      if (!response.ok || !result.success) {
        showToast(`✕ ${result.message || "Failed to rotate the recovery URL."}`, "error");
        return;
      }

      showToast(`✓ ${result.message}`, result.data.emailSent ? "success" : "warning");
      // The slug this page is currently on no longer resolves — move to
      // the new one immediately rather than leaving the owner on a
      // page that 404s on its next refresh.
      router.push(result.data.newVaultRecoveryPath);
    } catch {
      showToast("✕ We couldn't reach the server. Check your connection and try again.", "error");
    } finally {
      setIsRotating(false);
      setIsModalOpen(false);
    }
  }

  return (
    <div className="rotateVaultUrlSection">
      <div className="rotateVaultUrlText">
        <strong>Rotate Recovery URL</strong>
        <span>
          Forces a brand-new link for this page WITHOUT changing the passphrase. Use this if the URL
          itself may have leaked but the passphrase hasn&apos;t.
        </span>
      </div>
      <button
        type="button"
        className="wipeDatabaseCancelButton"
        onClick={() => setIsModalOpen(true)}
        disabled={isRotating}
      >
        {isRotating ? "Rotating…" : "Rotate Recovery URL"}
      </button>

      <ConfirmationModal
        isOpen={isModalOpen}
        title="Rotate Recovery URL?"
        description="This immediately replaces the current recovery link with a new one — this page's current URL will stop working right away. Your passphrase stays the same. The new link is emailed to the vault owner."
        confirmLabel="Rotate URL"
        onConfirm={handleConfirmRotate}
        onCancel={() => setIsModalOpen(false)}
      />
    </div>
  );
}
