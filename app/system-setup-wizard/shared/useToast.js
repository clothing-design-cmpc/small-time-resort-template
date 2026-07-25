/**
 * FILE: app/system-setup-wizard/shared/useToast.js
 * PURPOSE:
 * Owns the list of currently visible toast notifications for the
 * setup wizard (copy-to-clipboard confirmations, verification results).
 * Each toast auto-dismisses after 2 seconds. Mirrors the existing
 * per-area pattern (components/superAdmin/shared/useToast.js,
 * app/visitor/shared/useToast.js) — one instance per top-level area,
 * never a single instance imported across unrelated areas.
 */
"use client";

import { useCallback, useRef, useState } from "react";

const AUTO_DISMISS_MS = 2000;

export function useToast() {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);

  const dismissToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  /**
   * showToast
   * Adds a toast to the stack and schedules its own auto-dismiss.
   * type: "success" | "error" | "warning"
   */
  const showToast = useCallback(
    (message, type = "success") => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, message, type }]);
      window.setTimeout(() => dismissToast(id), AUTO_DISMISS_MS);
    },
    [dismissToast]
  );

  return { toasts, showToast, dismissToast };
}
