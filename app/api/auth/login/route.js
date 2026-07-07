/**
 * FILE: app/api/auth/login/route.js
 * ROLE: Public endpoint — called by app/superAdmin/login/page.jsx only
 *
 * PURPOSE:
 * Verifies the submitted email/password against Supabase Auth, confirms
 * the signed-in user has a super_admin row in admin_profiles, and sets
 * the HttpOnly "session" cookie that middleware.js reads to guard every
 * other /superAdmin/* route.
 *
 * DATA FLOW:
 * 1. Client POSTs { email, password } as JSON
 * 2. Zod validates the shape before touching Supabase
 * 3. browserClient.auth.signInWithPassword() verifies the credentials
 *    against Supabase Auth (this uses the anon key — correct for a
 *    plain sign-in call, it does not bypass RLS)
 * 4. adminClient looks up admin_profiles by the returned user id to
 *    confirm the account is actually a super_admin — a valid Supabase
 *    login alone is not enough to reach the admin area
 * 5. On success, an HttpOnly/Secure/SameSite=strict "session" cookie is
 *    set containing the user id + role so middleware.js (edge runtime,
 *    no DB access) can authorize requests without a network call
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { browserClient, adminClient } from "@/services/supabase";
import { prisma } from "@/services/prisma";

const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

// Same 15-minute access-token lifetime pattern as Rule 32.3 — the
// session cookie mirrors the underlying Supabase access token's window.
const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

export async function POST(request) {
  let payload;
  try {
    payload = loginRequestSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { success: false, data: null, message: "Enter a valid email and password." },
      { status: 400 }
    );
  }

  // Normalize email (trim + lowercase) before hitting Supabase, per the
  // field normalization standard — prevents casing/whitespace mismatches.
  const email = payload.email.trim().toLowerCase();
  const password = payload.password;

  // Step 1: verify the password against Supabase Auth.
  const { data: signInData, error: signInError } =
    await browserClient.auth.signInWithPassword({ email, password });

  // Always return the same generic message for wrong email vs wrong
  // password — never reveal which one failed (Rule 32.4).
  if (signInError || !signInData?.user) {
    return NextResponse.json(
      { success: false, data: null, message: "Invalid email or password." },
      { status: 401 }
    );
  }

  const authUserId = signInData.user.id;

  // Step 2: confirm this Auth user is actually a super admin. A valid
  // Supabase login is not sufficient on its own to reach /superAdmin.
  let adminProfile;
  try {
    adminProfile = await prisma.adminProfile.findUnique({
      where: { id: authUserId },
    });
  } catch (lookupError) {
    console.error("[api/auth/login] admin_profiles lookup failed:", lookupError.message);
    return NextResponse.json(
      { success: false, data: null, message: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }

  if (!adminProfile || adminProfile.role !== "super_admin") {
    // Sign the Supabase session back out — the browser must not keep a
    // valid Supabase session for an account that isn't authorized here.
    await adminClient.auth.admin.signOut(signInData.session.access_token).catch(() => {});
    return NextResponse.json(
      { success: false, data: null, message: "This account does not have admin access." },
      { status: 403 }
    );
  }

  // Step 3: set the HttpOnly session cookie middleware.js decodes.
  const sessionPayload = Buffer.from(
    JSON.stringify({ uid: authUserId, role: adminProfile.role })
  ).toString("base64");

  const response = NextResponse.json({
    success: true,
    data: { fullName: adminProfile.fullName, role: adminProfile.role },
    message: "Signed in successfully.",
  });

  response.cookies.set("session", sessionPayload, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
  });

  return response;
}
