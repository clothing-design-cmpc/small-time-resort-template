/**
 * FILE: services/supabase.js
 * PURPOSE:
 * Initializes two Supabase clients:
 *   1. browserClient — used in Client Components and hooks. Uses the anon key.
 *                       All queries go through RLS policies.
 *   2. adminClient   — used in Server Components and API route handlers only.
 *                       Uses the service role key — bypasses RLS.
 *                       NEVER import this in any "use client" file.
 *
 * CONNECTION TYPE NOTE:
 * This file uses the Supabase JS SDK (REST/Realtime over HTTPS) — it does not
 * use Postgres connection strings directly. The Direct and Session pooler
 * connection strings (DATABASE_URL_DIRECT / DATABASE_URL_SESSION) are kept in
 * .env.local for any raw Postgres access (e.g. scripts, future Prisma/pg use):
 *   - DATABASE_URL_DIRECT  → one-off scripts, migrations, long-lived processes
 *   - DATABASE_URL_SESSION → persistent/auth-related server queries needing a
 *                            stable session-based connection
 */
import { createClient } from "@supabase/supabase-js";

/**
 * browserClient
 * Safe for use in Client Components and custom hooks.
 * Respects Row Level Security — users can only access their own data.
 */
export const browserClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * adminClient
 * For server-side use only (API routes, Server Components).
 * Bypasses RLS — use only for trusted server-side operations.
 * NEVER import this in a "use client" file.
 */
export const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
