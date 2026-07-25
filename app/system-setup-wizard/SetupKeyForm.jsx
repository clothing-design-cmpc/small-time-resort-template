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
import DatabaseSetupStep from "./DatabaseSetupStep";

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
    return <DatabaseSetupStep />;
  }

  return (
    <form className="setupWizardCard" onSubmit={handleSubmit(onSubmit)}>
      <span className="setupWizardEyebrow">Step 1 of 10</span>
      <h1 className="setupWizardTitle">First-Run Setup</h1>
      <p className="setupWizardBody">
        This key confirms you have terminal access to this project before
        the wizard shows anything else.
      </p>

      <p className="setupWizardBody">
        Already ran <code>npm run scaffold-env</code> and generated{" "}
        <code>WIZARD_SETUP_KEY</code> while following the setup guide? Skip
        straight to the field below and paste that value in — no need to
        redo the steps.
      </p>

      <div className="setupWizardInstructions">
        <span className="setupWizardInstructionsLabel">Don&apos;t have a setup key yet?</span>
        <p className="setupWizardBody">
          Requires Node.js 18.18 or newer (Node 24 LTS recommended) — Prisma
          7 won&apos;t run on an older version.
        </p>
        <ol className="setupWizardInstructionsList">
          <li>
            Open a terminal in the project folder — Git Bash, PowerShell, or
            Terminal.
          </li>
          <li>
            Install dependencies (needed before any other command here
            will work — this is also what makes{" "}
            <code>npm run dev</code> itself runnable):
            <code className="setupWizardCodeBlock">npm install</code>
          </li>
          <li>
            Create your <code>.env.local</code> file, pre-filled with every
            key this project needs:
            <code className="setupWizardCodeBlock">npm run scaffold-env</code>
          </li>
          <li>
            Generate the setup key:
            <code className="setupWizardCodeBlock">
              node scripts/generateEnvSecret.mjs WIZARD_SETUP_KEY
            </code>
          </li>
          <li>
            Copy the printed value into the <code>WIZARD_SETUP_KEY=</code>{" "}
            line already waiting in <code>.env.local</code>, then restart{" "}
            <code>npm run dev</code>.
          </li>
          <li>Paste that same value into the field below.</li>
        </ol>
      </div>

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