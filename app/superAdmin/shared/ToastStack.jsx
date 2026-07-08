/**
 * FILE: app/superAdmin/shared/ToastStack.jsx
 * ROLE: Super-admin — shared UI, protected by middleware.js auth guard
 *
 * PURPOSE:
 * Renders the fixed top-center toast stack. Purely presentational —
 * all state lives in useToast (Rule 22.2).
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
