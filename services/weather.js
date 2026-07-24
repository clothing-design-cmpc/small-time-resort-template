/**
 * FILE: services/weather.js
 * PURPOSE:
 * Structured weather context for the AI Sales Insight widget
 * (villa-azure-ai-insight-and-directions-plan.txt, Part 1). Calls the
 * actual Google Weather API (part of Google Maps Platform, separate
 * from Gemini) instead of letting Gemini "search" for weather via
 * grounding — a real API call is more reliable/structured than a
 * generative search summary, and it's also far cheaper: 10,000 free
 * calls/month vs. spending Gemini's shared grounding quota (see the
 * plan doc's cost breakdown).
 *
 * Required .env key: GOOGLE_WEATHER_API_KEY (server-side only, never
 * NEXT_PUBLIC_ — same key-separation rule as GOOGLE_MAPS_API_KEY).
 *
 * Server-side only — never import this in a "use client" file.
 */

const WEATHER_FORECAST_URL = "https://weather.googleapis.com/v1/forecast/days:lookup";

/**
 * getResortWeatherForecast
 * Fetches a short daily forecast for the resort's location, formatted
 * as a plain-English summary ready to drop straight into the Gemini
 * prompt (services/aiInsight.js) — the insight generator never touches
 * Google's raw response shape.
 *
 * @param {number} latitude
 * @param {number} longitude
 * @param {number} [days] - forecast days to summarize, default 3
 *   (today + the next 2 days — enough to flag an incoming storm without
 *   burning quota on a longer window nothing here needs)
 * @returns {Promise<string|null>} plain-English summary, or null if the
 *   API key is missing or the request fails (caller must degrade
 *   gracefully — a missing forecast should never block the whole
 *   insight run, see services/aiInsight.js's "insufficient_data" guard)
 */
export async function getResortWeatherForecast(latitude, longitude, days = 3) {
  const apiKey = process.env.GOOGLE_WEATHER_API_KEY;
  if (!apiKey || !latitude || !longitude) {
    console.error("[weather] GOOGLE_WEATHER_API_KEY or resort coordinates missing — skipping forecast.");
    return null;
  }

  const url = `${WEATHER_FORECAST_URL}?key=${apiKey}&location.latitude=${latitude}&location.longitude=${longitude}&days=${days}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`[weather] Google Weather API responded ${response.status}`);
      return null;
    }

    const data = await response.json();
    const forecastDays = data.forecastDays ?? [];
    if (forecastDays.length === 0) return null;

    const lines = forecastDays.map((day) => {
      const dateLabel = `${day.displayDate?.year}-${String(day.displayDate?.month).padStart(2, "0")}-${String(
        day.displayDate?.day
      ).padStart(2, "0")}`;
      const condition = day.daytimeForecast?.weatherCondition?.description?.text ?? "unknown conditions";
      const maxTemp = day.maxTemperature?.degrees;
      const minTemp = day.minTemperature?.degrees;
      const precipChance = day.daytimeForecast?.precipitation?.probability?.percent;

      return (
        `${dateLabel}: ${condition}, ${minTemp ?? "?"}–${maxTemp ?? "?"}°C` +
        (precipChance != null ? `, ${precipChance}% chance of rain` : "")
      );
    });

    return lines.join("\n");
  } catch (error) {
    console.error("[weather] Forecast request failed:", error.message);
    return null;
  }
}
