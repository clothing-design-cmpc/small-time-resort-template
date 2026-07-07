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
 * Singleton pattern: reuses one PrismaClient across hot reloads in
 * development so we don't exhaust the connection pool.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.prismaClient ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prismaClient = prisma;
}
