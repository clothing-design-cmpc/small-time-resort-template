/**
 * FILE: utils/colorShade.js
 * PURPOSE:
 * Darkens a hex color by a given percentage. Used so the admin only
 * has to pick ONE brand color (SystemSettings.brandAccentColor) — the
 * matching --color-accent-hover shade is derived from it at render
 * time in app/layout.jsx instead of asking for a second color picker.
 */

/**
 * darkenHexColor
 * Takes a "#rrggbb" hex string and a 0-1 darken amount, returns a new
 * "#rrggbb" string with each channel scaled toward black by that
 * amount. Falls back to the input unchanged if it isn't a valid
 * 6-digit hex — callers always have a schema-level default to fall
 * back on regardless, so this never needs to throw.
 *
 * @param {string} hexColor - e.g. "#3f7d52"
 * @param {number} amount   - 0-1, how much darker (0.2 = 20% darker)
 */
export function darkenHexColor(hexColor, amount = 0.2) {
  const match = /^#?([a-fA-F0-9]{6})$/.exec(hexColor ?? "");
  if (!match) return hexColor;

  const [r, g, b] = [0, 2, 4].map((offset) =>
    parseInt(match[1].slice(offset, offset + 2), 16)
  );

  const darkenChannel = (channel) => Math.max(0, Math.round(channel * (1 - amount)));

  const toHexPair = (channel) => darkenChannel(channel).toString(16).padStart(2, "0");

  return `#${toHexPair(r)}${toHexPair(g)}${toHexPair(b)}`;
}
