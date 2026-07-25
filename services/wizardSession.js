/**
 * FILE: services/wizardSession.js
 * PURPOSE:
 * Shared gate for every /api/system-setup-wizard/* route past Step 1.
 * Confirms the caller already passed the WIZARD_SETUP_KEY check
 * (app/api/system-setup-wizard/verify-key) by reading the HttpOnly
 * "wizardSetupSession" cookie set there. This is a session marker only
 * — no secret content, no user identity, just "did this visitor
 * already clear Step 1 in the last 30 minutes."
 *
 * USAGE PATTERN (every wizard route past Step 1):
 * 1. isSetupWizardLocked() first — setup already done -> reject
 *    unconditionally, regardless of session state.
 * 2. hasWizardSession(request) second — setup not done, but this
 *    visitor hasn't passed Step 1 yet -> reject until they do.
 */

/**
 * hasWizardSession
 * Reads the wizardSetupSession cookie off the incoming request and
 * confirms it carries the expected marker value. Cookie expiry (30
 * minutes, set in verify-key/route.js) is enforced by the browser/
 * Next.js cookie store itself — an expired cookie is simply absent by
 * the time this reads it, so no separate timestamp check is needed
 * here.
 */
export function hasWizardSession(request) {
  return request.cookies.get("wizardSetupSession")?.value === "verified";
}
