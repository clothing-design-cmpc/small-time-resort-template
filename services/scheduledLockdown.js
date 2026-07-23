/**
 * FILE: services/scheduledLockdown.js
 * PURPOSE:
 * Determines whether the site is currently inside its daily scheduled
 * maintenance window (default: 2:00 AM – 3:00 AM Philippine Time,
 * back-to-back with the nightly database backup + env check jobs).
 * proxy.js uses this to redirect visitor traffic to /maintenance and
 * block public API routes during that window; app/visitor/layout.jsx
 * uses it to render the full-page notice for any render path that
 * skips proxy.js.
 *
 * WHY THIS IS TIME-COMPUTED, NOT A DB FLAG FLIPPED BY A CRON JOB:
 * A cron-toggled boolean (turn ON at 2 AM, turn OFF at 3 AM) has a
 * single point of failure: if the 3 AM "turn it back off" job ever
 * fails to run (GitHub Actions outage, a bad deploy, a changed secret
 * breaking the script), the site stays dark indefinitely with nothing
 * to self-correct it — exactly the kind of stuck lockdown Rule 40's
 * "never let backups slow live traffic" reasoning warns against
 * happening to the app itself. Computing the window directly off the
 * current time on every request is self-healing: the moment the clock
 * passes the end hour, the very next request sees the site unlocked
 * again, with no job, DB write, or manual "lift" step required. This
 * mirrors why services/postWipeLockdown.js DOES use a DB flag — that
 * lockdown has no natural end time and must stay locked until a human
 * explicitly reviews and lifts it — a nightly window is the opposite
 * case: it always has a known, fixed end time.
 *
 * CONFIGURATION:
 * SCHEDULED_LOCKDOWN_START_HOUR / SCHEDULED_LOCKDOWN_END_HOUR (both
 * optional, 24-hour Asia/Manila clock, default 2 and 3) — change these
 * instead of touching this file if the window ever needs to move.
 */

const DEFAULT_START_HOUR = 2; // 2:00 AM PHT
const DEFAULT_END_HOUR = 3; // 3:00 AM PHT — site is back the moment this hour starts

/**
 * getScheduledLockdownWindow
 * Reads the configured start/end hour, falling back to the defaults
 * above on anything missing or non-numeric — a malformed env var must
 * never crash the check, it should just fall back to the known-good
 * default window.
 */
function getScheduledLockdownWindow() {
  const startHour = Number.parseInt(process.env.SCHEDULED_LOCKDOWN_START_HOUR, 10);
  const endHour = Number.parseInt(process.env.SCHEDULED_LOCKDOWN_END_HOUR, 10);
  return {
    startHour: Number.isInteger(startHour) ? startHour : DEFAULT_START_HOUR,
    endHour: Number.isInteger(endHour) ? endHour : DEFAULT_END_HOUR,
  };
}

/**
 * getCurrentManilaHour
 * Returns the current hour (0-23) in Asia/Manila time, regardless of
 * which timezone the server/runtime itself is running in (Vercel's
 * functions run in UTC) — this check must always reason in the
 * resort's own local time, not the host's.
 */
function getCurrentManilaHour() {
  const manilaHourString = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hour12: false,
    timeZone: "Asia/Manila",
  }).format(new Date());
  // Intl can format midnight as "24" in some environments instead of
  // "0" — normalize so the comparison below always sees 0-23.
  return Number.parseInt(manilaHourString, 10) % 24;
}

/**
 * isScheduledLockdownActive
 * True whenever the current Manila hour falls within
 * [startHour, endHour) — e.g. the default 2..3 means locked from
 * 2:00:00 AM up to (not including) 3:00:00 AM.
 */
export function isScheduledLockdownActive() {
  const { startHour, endHour } = getScheduledLockdownWindow();
  const currentHour = getCurrentManilaHour();
  return currentHour >= startHour && currentHour < endHour;
}

/**
 * getScheduledLockdownWindowLabel
 * Human-readable window string, e.g. "2:00 AM – 3:00 AM (PHT)" — used
 * both by the full-page maintenance message during the window and by
 * the always-visible advance notice on visitor pages.
 */
export function getScheduledLockdownWindowLabel() {
  const { startHour, endHour } = getScheduledLockdownWindow();
  const formatHour = (hour) => {
    const period = hour >= 12 ? "PM" : "AM";
    const twelveHour = hour % 12 === 0 ? 12 : hour % 12;
    return `${twelveHour}:00 ${period}`;
  };
  return `${formatHour(startHour)} – ${formatHour(endHour)} (PHT)`;
}
