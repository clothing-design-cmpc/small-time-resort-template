/**
 * FILE: app/system-setup-wizard/SetupKeyForm.jsx
 * ROLE: Client Component — Step 1 of the setup wizard
 *
 * PURPOSE:
 * Single-field form for the WIZARD_SETUP_KEY. On success, the API
 * route sets an HttpOnly wizardSetupSession cookie and this component
 * advances local step state to 2 (later steps are added incrementally
 * as their own components — this file only owns Step 1 for now).
 *
 * DATA FLOW:
 * 1. User submits the setup key
 * 2. POST /api/system-setup-wizard/verify-key
 * 3. On 200: show a success state (Step 2 placeholder until built)
 * 4. On 401/404: show the returned message inline, field is cleared
 *    on every failed attempt so a mistyped key isn't silently resubmitted
 */
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const setupKeySchema = z.object({
  setupKey: z.string().min(1, "Enter the setup key."),
});

export default function SetupKeyForm() {
  const [isVerified, setIsVerified] = useState(false);
  const [serverError, setServerError] = useState(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(setupKeySchema),
  });

  /**
   * onSubmit
   * Sends the setup key to the verify-key route. Clears the field on
   * every failure (Rule: never leave a rejected secret sitting in the
   * input) and surfaces the server's message as-is (Rule 34.1 — the
   * backend message is already human-readable, never re-worded here).
   */
  async function onSubmit(data) {
    setServerError(null);

    try {
      const response = await fetch("/api/system-setup-wizard/verify-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setupKey: data.setupKey }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        setServerError(result.message ?? "Invalid setup key.");
        reset({ setupKey: "" });
        return;
      }

      setIsVerified(true);
    } catch {
      setServerError("We couldn't reach the server. Check your connection and try again.");
      reset({ setupKey: "" });
    }
  }

  if (isVerified) {
    return (
      <div className="setupWizardCard" role="status">
        <span className="setupWizardEyebrow">Step 1 of 10 — complete</span>
        <h1 className="setupWizardTitle">Setup key verified</h1>
        <p className="setupWizardBody">
          The rest of the wizard (database setup, super-admin creation,
          environment checklist, and vault setup) is being built
          incrementally — this session stays active for 30 minutes.
        </p>
      </div>
    );
  }

  return (
    <form className="setupWizardCard" onSubmit={handleSubmit(onSubmit)}>
      <span className="setupWizardEyebrow">Step 1 of 10</span>
      <h1 className="setupWizardTitle">First-Run Setup</h1>
      <p className="setupWizardBody">
        Enter the setup key from your <code>.env.local</code> to begin.
        Generate one with{" "}
        <code>node scripts/generateEnvSecret.mjs WIZARD_SETUP_KEY</code>{" "}
        if you haven&apos;t already.
      </p>

      {serverError && (
        <p className="setupWizardError" role="alert">
          {serverError}
        </p>
      )}

      <label className="setupWizardLabel" htmlFor="setupKey">
        Setup key
      </label>
      <input
        id="setupKey"
        type="password"
        autoFocus
        autoComplete="off"
        className="setupWizardInput"
        {...register("setupKey")}
      />
      {errors.setupKey && (
        <span className="setupWizardFieldError" role="alert">
          {errors.setupKey.message}
        </span>
      )}

      <button type="submit" className="setupWizardButton" disabled={isSubmitting}>
        {isSubmitting ? "Verifying…" : "Continue"}
      </button>
    </form>
  );
}
