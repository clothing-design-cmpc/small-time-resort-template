/**
 * FILE: utils/colorShade.js
 * PURPOSE:
 * Shared hex-color math for the 5-token brand color system
 * (SystemSettings.brandAccentColor/brandBackgroundColor/
 * brandSurfaceColor/brandBorderColor/brandTextColor). The admin only
 * ever picks these 5 base colors — every derived shade (hover states,
 * secondary/muted text, tinted borders) is computed from them at
 * render time in app/layout.jsx so there's never a second color
 * picker for something that's really just "the accent, but darker".
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
  const channels = hexToChannels(hexColor);
  if (!channels) return hexColor;

  const darkenChannel = (channel) => Math.max(0, Math.round(channel * (1 - amount)));
  return channelsToHex(channels.map(darkenChannel));
}

/**
 * lightenHexColor
 * Same idea as darkenHexColor but scales each channel toward white
 * instead — used to derive a lighter tint (e.g. a hover state on a
 * light surface color) from a single stored base color.
 *
 * @param {string} hexColor - e.g. "#eef2e7"
 * @param {number} amount   - 0-1, how much lighter (0.2 = 20% lighter)
 */
export function lightenHexColor(hexColor, amount = 0.2) {
  const channels = hexToChannels(hexColor);
  if (!channels) return hexColor;

  const lightenChannel = (channel) => Math.min(255, Math.round(channel + (255 - channel) * amount));
  return channelsToHex(channels.map(lightenChannel));
}

/**
 * hexToRgba
 * Converts a "#rrggbb" hex string into an "rgba(r, g, b, alpha)" CSS
 * string — used to derive translucent variants (secondary/muted text,
 * subtle borders) from a single stored solid base color, matching the
 * rgba-tint pattern globals.css already used before these tokens were
 * admin-editable. Falls back to a fully-opaque black rgba() if the
 * input isn't a valid 6-digit hex, so a bad DB value never breaks
 * layout — just renders visibly wrong instead of throwing.
 *
 * @param {string} hexColor - e.g. "#1c2b20"
 * @param {number} alpha    - 0-1 opacity
 */
export function hexToRgba(hexColor, alpha = 1) {
  const channels = hexToChannels(hexColor);
  if (!channels) return `rgba(0, 0, 0, ${alpha})`;
  return `rgba(${channels[0]}, ${channels[1]}, ${channels[2]}, ${alpha})`;
}

/** Parses "#rrggbb" into [r, g, b] (0-255 each), or null if invalid. */
function hexToChannels(hexColor) {
  const match = /^#?([a-fA-F0-9]{6})$/.exec(hexColor ?? "");
  if (!match) return null;
  return [0, 2, 4].map((offset) => parseInt(match[1].slice(offset, offset + 2), 16));
}

/** Joins [r, g, b] (0-255 each) back into a "#rrggbb" string. */
function channelsToHex(channels) {
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}
