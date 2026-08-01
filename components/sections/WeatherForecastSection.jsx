/**
 * FILE: components/sections/WeatherForecastSection.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Shows a 4-day weather forecast (today + next 3 days) for the resort
 * on the homepage, so a guest can check conditions before booking
 * without leaving the site.
 *
 * DATA FLOW:
 * 1. Rendered inside app/visitor/page.jsx, right after About
 * 2. Server Component reads the WeatherForecastCache singleton row
 *    directly via Prisma — same pattern AmenitiesHighlightSection.jsx
 *    uses for its own data. This section NEVER calls the Google
 *    Weather API itself; that only happens 3x/day from
 *    app/api/cron/weather/route.js (see vercel.json)
 * 3. If the cache row doesn't exist yet (first deploy, before the
 *    first cron run) or the last run failed with no prior data, this
 *    section renders a calm "getting things ready" empty state
 *    instead of a blank gap or a crash
 */
import { prisma } from "@/services/prisma";
import { Sun, CloudSun, Cloud, CloudRain, CloudSnow, CloudFog, CloudLightning, CloudHail, Wind, Tornado, CloudOff } from "lucide-react";
import { getWeatherIconName } from "@/utils/weatherIcons";
import "./WeatherForecastSection.css";

// Lucide icon names are PascalCase strings (from utils/weatherIcons.js)
// mapped here to the actual imported components — same lookup-table
// pattern as IconPicker.jsx's getIconByName, scoped to the handful of
// weather-relevant icons this section actually uses.
const ICON_COMPONENTS = {
  Sun,
  CloudSun,
  Cloud,
  CloudRain,
  CloudSnow,
  CloudFog,
  CloudLightning,
  CloudHail,
  Wind,
  Tornado,
};

const DAY_LABEL_FORMATTER = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" });

/**
 * formatDayLabel
 * Converts a "YYYY-MM-DD" cache string into a short display label
 * (e.g. "Wed, Aug 5"). Falls back to the raw string if parsing fails,
 * so a malformed date never breaks the whole section.
 */
function formatDayLabel(dateString, index) {
  if (index === 0) return "Today";
  const parsed = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateString;
  return DAY_LABEL_FORMATTER.format(parsed);
}

export default async function WeatherForecastSection() {
  // Read-only fetch of the cached forecast. Fails safe to null so this
  // public page never 500s just because the query hiccups.
  const cache = await prisma.weatherForecastCache.findUnique({ where: { id: "singleton" } }).catch(() => null);

  const forecastDays = Array.isArray(cache?.forecastDays) ? cache.forecastDays : [];
  const hasForecast = cache?.status === "ok" && forecastDays.length > 0;

  return (
    <section className="weatherForecastSection" id="weather">
      <div className="weatherForecastContainer">
        <div className="weatherForecastHeader">
          <span className="weatherForecastEyebrow">Plan Your Visit</span>
          <h2 className="weatherForecastTitle">Weather Forecast</h2>
          <p className="weatherForecastSubtitle">
            A quick look at conditions around the resort for the next few days.
          </p>
        </div>

        {hasForecast ? (
          <div className="weatherForecastGrid">
            {forecastDays.map((day, index) => {
              const IconComponent = ICON_COMPONENTS[getWeatherIconName(day.conditionType)] ?? Cloud;
              return (
                <article key={day.date ?? index} className="weatherForecastCard">
                  <span className="weatherForecastDayLabel">{formatDayLabel(day.date, index)}</span>
                  <div className="weatherForecastIcon" aria-hidden="true">
                    <IconComponent size={32} strokeWidth={1.5} />
                  </div>
                  <span className="weatherForecastCondition">{day.conditionText}</span>
                  <div className="weatherForecastTemps">
                    {day.maxTemp != null && <span className="weatherForecastTempMax">{Math.round(day.maxTemp)}°</span>}
                    {day.minTemp != null && <span className="weatherForecastTempMin">{Math.round(day.minTemp)}°</span>}
                  </div>
                  {day.precipChance != null && (
                    <span className="weatherForecastPrecip">{day.precipChance}% rain</span>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          // Empty state (Rule 25.3) — first deploy before the initial
          // cron run, or every attempt so far has failed with no prior
          // cached data to fall back to.
          <div className="weatherForecastEmptyState">
            <CloudOff size={28} strokeWidth={1.5} aria-hidden="true" />
            <p>Forecast is being set up. Check back shortly.</p>
          </div>
        )}
      </div>
    </section>
  );
}
