/**
 * FILE: services/prisma.js
 * PURPOSE:
 * Shared Prisma Client singleton for use inside Next.js API routes and
 * Server Components (server-side only — never import this in a
 * "use client" file).
 *
 * Prisma 7 requires a driver adapter at runtime instead of reading a
 * connection URL directly off the datasource block. This uses
 * @prisma/adapter-pg pointed at DATABASE_URL — the transaction pooler
 * connection (port 6543, pgbouncer=true) — since this is high-frequency
 * app traffic, not schema/migration commands.
 *
 * Falls back to DIRECT_URL when DATABASE_URL isn't set. This matters
 * for the standalone vault-passphrase scripts (scripts/rotateVault
 * Passphrase.mjs, scripts/rotateVaultPassphraseIfDue.mjs) — they import
 * this same shared client (via services/vaultAuth.js) but, per their
 * own header comments, are only ever given DIRECT_URL in CI (GitHub
 * Actions secrets) since they're a low-frequency, decoupled job, not
 * live app traffic. Without this fallback, DATABASE_URL is undefined
 * in that environment and the pg adapter falls through to a default
 * localhost connection, which fails with ECONNREFUSED on a runner with
 * no local Postgres. Inside the live Next.js app DATABASE_URL is
 * always set, so this fallback never changes that path's behavior.
 *
 * Singleton pattern: reuses one PrismaClient across hot reloads in
 * development so we don't exhaust the connection pool.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL,
});

const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.prismaClient ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prismaClient = prisma;
}
