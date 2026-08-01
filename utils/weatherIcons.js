/**
 * FILE: utils/weatherIcons.js
 * PURPOSE:
 * Maps a Google Weather API weatherCondition.type value (e.g.
 * "LIGHT_RAIN_SHOWERS", "PARTLY_CLOUDY", "THUNDERSTORM") to a Lucide
 * icon name. Google's condition types are highly granular (~40+
 * values) — this buckets them into a handful of visual categories so
 * WeatherForecastSection.jsx never needs to hotlink Google's own icon
 * images (which would require a next.config.mjs remotePatterns entry
 * and an extra external dependency for something this simple covers).
 *
 * DATA FLOW:
 * 1. services/weather.js's getVisitorWeatherForecast() saves the raw
 *    conditionType string per day into WeatherForecastCache
 * 2. WeatherForecastSection.jsx calls getWeatherIconName(conditionType)
 *    per day and renders the matching icon from lucide-react
 */

const CONDITION_ICON_MAP = {
  // Clear / sunny
  CLEAR: "Sun",
  MOSTLY_CLEAR: "Sun",

  // Partly/mostly cloudy
  PARTLY_CLOUDY: "CloudSun",
  MOSTLY_CLOUDY: "Cloud",
  CLOUDY: "Cloud",

  // Fog / haze / low visibility
  FOG: "CloudFog",
  HAZE: "CloudFog",
  SMOKE: "CloudFog",
  DUST: "CloudFog",
  SAND: "CloudFog",
  ASH: "CloudFog",

  // Wind
  WINDY: "Wind",

  // Thunderstorms
  THUNDERSTORM: "CloudLightning",
  THUNDERSHOWER: "CloudLightning",
  LIGHT_THUNDERSTORM_RAIN: "CloudLightning",
  SCATTERED_THUNDERSTORMS: "CloudLightning",
  HEAVY_THUNDERSTORM: "CloudLightning",

  // Hail
  HAIL_SHOWERS: "CloudHail",
  LIGHT_HAIL_SHOWERS: "CloudHail",
  HEAVY_HAIL_SHOWERS: "CloudHail",
  HAIL: "CloudHail",
  HEAVY_HAIL: "CloudHail",

  // Snow
  LIGHT_SNOW_SHOWERS: "CloudSnow",
  CHANCE_OF_SNOW_SHOWERS: "CloudSnow",
  SCATTERED_SNOW_SHOWERS: "CloudSnow",
  HEAVY_SNOW_SHOWERS: "CloudSnow",
  LIGHT_TO_MODERATE_SNOW: "CloudSnow",
  MODERATE_TO_HEAVY_SNOW: "CloudSnow",
  SNOW: "CloudSnow",
  LIGHT_SNOW: "CloudSnow",
  HEAVY_SNOW: "CloudSnow",
  SNOWSTORM: "CloudSnow",
  SNOW_PERIODICALLY_HEAVY: "CloudSnow",
  HEAVY_SNOW_STORM: "CloudSnow",
  BLOWING_SNOW: "CloudSnow",
  RAIN_AND_SNOW: "CloudSnow",

  // Extreme
  SQUALL: "CloudLightning",
  TORNADO: "Tornado",
};

// Anything with "RAIN" or "SHOWER" in the name that isn't already
// mapped above falls back to a rain icon via getWeatherIconName's
// substring check below — Google's rain-intensity variants
// (LIGHT_RAIN, MODERATE_TO_HEAVY_RAIN, RAIN_PERIODICALLY_HEAVY, etc.)
// are too numerous to list individually and all mean the same icon.
const DEFAULT_ICON = "Cloud";

/**
 * getWeatherIconName
 * Resolves a Google Weather API conditionType string to a Lucide icon
 * component name. Falls back to a substring match for any rain/shower
 * variant not explicitly listed, then to a generic cloud icon.
 *
 * @param {string|null|undefined} conditionType
 * @returns {string} Lucide icon component name (e.g. "Sun", "CloudRain")
 */
export function getWeatherIconName(conditionType) {
  if (!conditionType) return DEFAULT_ICON;

  if (CONDITION_ICON_MAP[conditionType]) {
    return CONDITION_ICON_MAP[conditionType];
  }

  // Catch-all for rain-intensity variants not individually listed
  if (conditionType.includes("RAIN") || conditionType.includes("SHOWER")) {
    return "CloudRain";
  }

  return DEFAULT_ICON;
}
