/**
 * FILE: app/api/system-setup-wizard/verify-key/route.js
 * ROLE: Step 1 of the first-run setup wizard — no account, no role
 *
 * PURPOSE:
 * Accepts the WIZARD_SETUP_KEY typed into the wizard's first screen.
 * On a correct key, sets a short-lived, HttpOnly "wizardSetupSession"
 * cookie so the rest of the wizard's steps/pages can confirm the
 * visitor already passed this gate, without re-typing the key on
 * every step. On a wrong key, does nothing except log the attempt —
 * never reveals whether WIZARD_SETUP_KEY is even configured.
 *
 * AUTO-LOCK: checked FIRST, before even reading the request body. If
 * setup is already complete (see services/setupWizardStatus.js), this
 * route refuses unconditionally — the correct key no longer matters
 * once an owner admin + vault passphrase already exist.
 *
 * DATA FLOW:
 * 1. isSetupWizardLocked() — bail out immediately if setup is done
 * 2. Read { setupKey } from the JSON body
 * 3. isValidWizardSetupKey() — constant-time compare against env
 * 4. On success: set wizardSetupSession cookie (HttpOnly, Secure,
 *    SameSite=strict, 30 min), log setup_key_verified
 * 5. On failure: log setup_key_rejected, return a generic 401 —
 *    identical response shape whether the key was wrong or simply
 *    missing/unconfigured, so no information leaks either way
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { isValidWizardSetupKey } from "@/services/adminSession";
import { isSetupWizardLocked } from "@/services/setupWizardStatus";
import { logSecurityEvent } from "@/services/securityLog";

// 30 minutes — long enough to complete the wizard's early steps in one
// sitting, short enough that a stale cookie on a shared/dev machine
// doesn't stay valid indefinitely.
const WIZARD_SESSION_MAX_AGE_SECONDS = 30 * 60;

export async function POST(request) {
  // Refuse before touching the request body at all once setup is done —
  // this is the actual enforcement point, not just a UI nicety.
  if (await isSetupWizardLocked()) {
    return NextResponse.json(
      { success: false, data: null, message: "Setup has already been completed." },
      { status: 404 }
    );
  }

  let setupKey;
  try {
    const body = await request.json();
    setupKey = body?.setupKey;
  } catch {
    return NextResponse.json(
      { success: false, data: null, message: "Invalid request." },
      { status: 400 }
    );
  }

  const keyIsValid = isValidWizardSetupKey(setupKey);

  if (!keyIsValid) {
    await logSecurityEvent({
      eventType: "setup_key_rejected",
      actor: null,
      request,
      details: "Setup wizard: incorrect or missing WIZARD_SETUP_KEY.",
    });

    // Same generic message whether the key was wrong, empty, or
    // WIZARD_SETUP_KEY was never configured — never confirm which.
    return NextResponse.json(
      { success: false, data: null, message: "Invalid setup key." },
      { status: 401 }
    );
  }

  await logSecurityEvent({
    eventType: "setup_key_verified",
    actor: null,
    request,
    details: "Setup wizard: WIZARD_SETUP_KEY accepted, wizard session started.",
  });

  const response = NextResponse.json({
    success: true,
    data: null,
    message: "Setup key verified.",
  });

  // Cookie holds no secret content — just a boolean-style marker the
  // wizard's later steps check for. The key itself is never echoed
  // back or stored anywhere past this response.
  response.cookies.set("wizardSetupSession", "verified", {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    maxAge: WIZARD_SESSION_MAX_AGE_SECONDS,
    path: "/",
  });

  return response;
}
