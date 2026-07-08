/**
 * FILE: components/superAdmin/shared/ToastStack.jsx
 * PURPOSE:
 * Renders the current toast list at fixed top-center, per the toast
 * position standard. pointerEvents: none on the wrapper (in CSS) so
 * toasts never block clicks on the page underneath them.
 */
"use client";

import "./toast-stack.css";

export default function ToastStack({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;

  return (
    <div className="adminToastStack" role="status" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`adminToastItem adminToastItem--${toast.type}`}
          onClick={() => onDismiss(toast.id)}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
