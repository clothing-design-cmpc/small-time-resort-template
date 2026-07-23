/**
 * FILE: app/visitor/shared/useToast.js
 * ROLE: Visitor — shared hook, public, no auth required
 *
 * PURPOSE:
 * Manages the toast notification stack for visitor-facing pages.
 * Mirrors app/superAdmin/shared/useToast.js (Rule 22.2) — owned by the
 * nearest parent component; sub-components receive showToast as a prop
 * rather than creating their own instance (Rule 22.4).
 *
 * DATA FLOW:
 * 1. showToast(message, type) pushes a new toast onto the stack
 * 2. Each toast auto-dismisses itself after 2 seconds
 * 3. dismissToast lets the stack remove a toast early (manual close)
 */
"use client";

import { useCallback, useState } from "react";

export function useToast() {
  const [toasts, setToasts] = useState([]);

  const dismissToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (message, type = "success") => {
      const id = crypto.randomUUID();
      setToasts((current) => [...current, { id, message, type }]);

      // Auto-dismiss after 2 seconds, per Rule 22.6.
      setTimeout(() => dismissToast(id), 2000);
    },
    [dismissToast]
  );

  return { toasts, showToast, dismissToast };
}
