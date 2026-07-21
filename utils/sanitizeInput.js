/**
 * FILE: utils/sanitizeInput.js
 * PURPOSE:
 * Shared forbidden-character filter for every user-editable text field
 * (Rule 18.1). Strips the primary XSS/HTML-injection/SQL-injection/
 * template-injection vectors on the way into React state — never
 * shows an error for a blocked character, the field just silently
 * won't accept it. This is a UX-level guard only; every route handler
 * that receives this value must still validate it server-side (Zod)
 * before it reaches Prisma.
 *
 * DATA FLOW:
 * 1. Any onChange handler for a public-facing <input>/<textarea> calls
 *    sanitizeTextInput(event.target.value) before setState
 */

// Primary XSS / HTML / SQL / template injection vectors.
const FORBIDDEN_CHARACTERS_PATTERN = /[<>{}[\]/\\;'"`=]/g;

/**
 * sanitizeTextInput
 * Strips forbidden characters from a raw input value. Safe to call on
 * every keystroke — cheap regex replace, no allocation beyond the
 * returned string.
 */
export function sanitizeTextInput(rawValue) {
  if (typeof rawValue !== "string") return "";
  return rawValue.replace(FORBIDDEN_CHARACTERS_PATTERN, "");
}
