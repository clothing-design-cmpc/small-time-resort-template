/**
 * FILE: app/visitor/shared/ToastStack.jsx
 * ROLE: Visitor — shared UI, public, no auth required
 *
 * PURPOSE:
 * Renders the fixed top-center toast stack for visitor-facing pages.
 * Purely presentational — all state lives in useToast (Rule 22.2).
 */
"use client";

import "./toast-stack.css";

export default function ToastStack({ toasts, onDismiss }) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="toastStack">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toastItem toastItem--${toast.type}`}
          role="status"
          onClick={() => onDismiss(toast.id)}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
