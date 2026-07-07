// FILE: prisma.config.mjs
// PURPOSE:
// Prisma 7 moved all connection URLs and CLI settings out of
// schema.prisma and into this file. The Prisma CLI (db push, generate,
// db seed) reads this file — the app's runtime PrismaClient does NOT;
// it uses the driver adapter in services/prisma.js instead.
//
// Uses DIRECT_URL (session pooler, port 5432) here because schema
// commands (db push) need prepared-statement support that the
// transaction pooler (DATABASE_URL, port 6543) does not provide.
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node prisma/seed.js",
  },
  datasource: {
    url: env("DIRECT_URL"),
  },
});
