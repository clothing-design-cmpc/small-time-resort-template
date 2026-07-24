/**
 * FILE: services/referenceCode.js
 * PURPOSE:
 * Generates the unique reference code printed on every booking invoice
 * (villa-azure-ai-insight-and-directions-plan.txt, Part 2). This code is
 * the "proof of stay" a visitor types into the gated "How to Get There"
 * widget — it is never sequential so it can't be guessed by incrementing
 * a number, and it's random enough that brute-forcing it is impractical
 * even with the verify endpoint's rate limit (services/rateLimit.js).
 *
 * FORMAT: "VAR-YYYYMMDD-XXXXX"
 *   VAR      - fixed prefix (Villa Azure Resort)
 *   YYYYMMDD - the booking's creation date, useful at a glance for staff
 *   XXXXX    - 5 random uppercase alphanumeric characters (Crockford-ish
 *              alphabet, excludes 0/O/1/I to avoid guest transcription
 *              errors when reading it off a printed/PDF invoice)
 *
 * Collisions are astronomically unlikely (36^5 combinations per day) but
 * generateUniqueReferenceCode() still checks the DB and retries, since
 * Booking.referenceCode is a unique column and an insert-time collision
 * would otherwise surface as a raw Prisma error instead of a clean retry.
 */
import { prisma } from "@/services/prisma";

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // no 0/O/1/I
const RANDOM_SEGMENT_LENGTH = 5;
const MAX_GENERATION_ATTEMPTS = 5;

/**
 * randomSegment
 * Builds the 5-character random suffix using crypto-strength randomness
 * (Node's global crypto) rather than Math.random(), since this code is
 * effectively an access credential (Part 2's whole point is that only
 * someone holding the real invoice can unlock directions).
 */
function randomSegment() {
  const bytes = crypto.getRandomValues(new Uint8Array(RANDOM_SEGMENT_LENGTH));
  let result = "";
  for (let i = 0; i < RANDOM_SEGMENT_LENGTH; i += 1) {
    result += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return result;
}

/**
 * buildReferenceCode
 * Pure formatter — "VAR-20260724-7F3K2" — no DB access, used by the
 * uniqueness-checking wrapper below.
 */
function buildReferenceCode(date = new Date()) {
  const datePart = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(
    date.getUTCDate()
  ).padStart(2, "0")}`;
  return `VAR-${datePart}-${randomSegment()}`;
}

/**
 * generateUniqueReferenceCode
 * Generates a reference code and confirms no existing Booking already
 * has it, retrying on the rare collision. Call this from inside the same
 * transaction that creates the Booking row (see app/api/bookings/route.js)
 * so the uniqueness check and the insert see a consistent view.
 *
 * @param {object} [client] - optional Prisma transaction client (tx);
 *   falls back to the shared prisma singleton when not inside a transaction.
 */
export async function generateUniqueReferenceCode(client = prisma) {
  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
    const candidate = buildReferenceCode();
    const existing = await client.booking.findUnique({
      where: { referenceCode: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  // Practically unreachable (36^5 = ~60M combos/day) — fail loudly rather
  // than silently returning a possibly-colliding code.
  throw new Error("Could not generate a unique booking reference code. Please try again.");
}
