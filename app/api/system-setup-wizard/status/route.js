/**
 * FILE: app/api/system-setup-wizard/status/route.js
 * ROLE: Public, read-only wizard lock status — no auth, no secrets
 *
 * PURPOSE:
 * Exposes a single boolean — the exact same isSetupWizardLocked()
 * truth every other wizard route already gates on — so
 * scripts/setup-guide.html (opened as a plain local file, outside
 * Next.js) can poll it while `npm run dev` is running and reflect
 * live whether first-run setup is finished, instead of relying only
 * on manually-checked, localStorage-only checkboxes.
 *
 * WHY THIS IS SAFE TO LEAVE UNAUTHENTICATED:
 * Returns nothing but `{ locked: boolean }` — no admin data, no
 * counts, no IDs, no env values. Knowing whether setup has been
 * completed on a deployment gives an attacker no more than they'd
 * already learn by requesting /system-setup-wizard itself and reading
 * its 404-vs-200 status; this route just makes that same fact
 * fetchable with CORS enabled from a file:// origin.
 *
 * CORS: setup-guide.html is a local file (file:// origin, not
 * http://localhost:3000), so a plain same-origin fetch would be
 * blocked by the browser. Access-Control-Allow-Origin: * is
 * deliberate here — see the "safe to leave unauthenticated" note
 * above for why a fully public boolean is an acceptable trade-off.
 *
 * DATA FLOW:
 * 1. GET -> isSetupWizardLocked() (services/setupWizardStatus.js)
 * 2. Return { success: true, data: { locked } } with a permissive
 *    CORS header
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { isSetupWizardLocked } from "@/services/setupWizardStatus";

export async function GET() {
  const locked = await isSetupWizardLocked();

  return NextResponse.json(
    { success: true, data: { locked }, message: null },
    { headers: { "Access-Control-Allow-Origin": "*" } }
  );
}
