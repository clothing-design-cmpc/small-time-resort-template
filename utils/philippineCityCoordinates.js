/**
 * FILE: utils/philippineCityCoordinates.js
 * PURPOSE:
 * PageViewDaily (Rule 41) only stores a city name string, never raw
 * coordinates. To plot Top Locations on the super-admin Analytics map,
 * this file provides a static, hand-maintained lookup of common
 * Philippine city/municipality names to approximate [latitude,
 * longitude] pairs (city-level precision only, matching Rule 38.5's
 * 2-decimal rounding convention — this is not meant for anything more
 * precise than "where on the map does this dot go").
 *
 * DATA FLOW:
 * 1. AnalyticsLocationMapInner.jsx receives the locationBreakdown rows
 *    ({ city, countryCode, views }) from AnalyticsClient.jsx
 * 2. For each row, getCityCoordinates() resolves a lat/lng pair
 * 3. Rows that can't be resolved (city not in this table, or not PH)
 *    are simply skipped on the map — they still appear in the ranked
 *    list underneath, so no data is hidden from the admin
 */

// Approximate city-center coordinates, 2 decimals (city-level only).
// Keys are lowercase for case-insensitive lookups.
const PHILIPPINE_CITY_COORDINATES = {
  manila: [14.6, 120.98],
  "quezon city": [14.68, 121.04],
  makati: [14.55, 121.02],
  taguig: [14.52, 121.05],
  pasig: [14.58, 121.09],
  mandaluyong: [14.58, 121.03],
  "san juan": [14.6, 121.03],
  marikina: [14.65, 121.1],
  pasay: [14.54, 121.0],
  paranaque: [14.5, 121.02],
  "las pinas": [14.45, 120.98],
  muntinlupa: [14.38, 121.04],
  caloocan: [14.65, 120.98],
  malabon: [14.66, 120.96],
  navotas: [14.67, 120.94],
  valenzuela: [14.7, 120.98],
  imus: [14.43, 120.94],
  "dasmarinas": [14.33, 120.94],
  bacoor: [14.46, 120.94],
  "general trias": [14.39, 120.88],
  cavite: [14.48, 120.9],
  antipolo: [14.59, 121.18],
  cainta: [14.58, 121.12],
  taytay: [14.57, 121.13],
  binangonan: [14.47, 121.19],
  calamba: [14.21, 121.17],
  "santa rosa": [14.31, 121.11],
  "san pablo": [14.07, 121.33],
  lipa: [13.94, 121.16],
  batangas: [13.76, 121.06],
  lucena: [13.94, 121.62],
  naga: [13.62, 123.18],
  legazpi: [13.14, 123.73],
  "puerto princesa": [9.74, 118.75],
  angeles: [15.14, 120.59],
  "san fernando": [15.03, 120.69],
  olongapo: [14.83, 120.28],
  "baguio": [16.41, 120.6],
  dagupan: [16.04, 120.33],
  tarlac: [15.49, 120.6],
  malolos: [14.84, 120.81],
  meycauayan: [14.74, 120.96],
  "san jose del monte": [14.81, 121.05],
  cebu: [10.32, 123.9],
  "cebu city": [10.32, 123.9],
  mandaue: [10.32, 123.94],
  "lapu-lapu": [10.31, 123.99],
  talisay: [10.24, 123.85],
  "davao city": [7.19, 125.46],
  davao: [7.19, 125.46],
  "cagayan de oro": [8.48, 124.65],
  iloilo: [10.72, 122.56],
  "iloilo city": [10.72, 122.56],
  bacolod: [10.68, 122.95],
  tacloban: [11.24, 125.0],
  zamboanga: [6.91, 122.08],
  "general santos": [6.11, 125.17],
  butuan: [8.95, 125.53],
  dumaguete: [9.31, 123.31],
  tagbilaran: [9.65, 123.85],
  koronadal: [6.5, 124.85],
  iligan: [8.23, 124.24],
  "cotabato city": [7.22, 124.25],
  "santa cruz": [14.28, 121.42],
};

/**
 * getCityCoordinates
 * Looks up a Philippine city name (case-insensitive, trimmed) and
 * returns [latitude, longitude], or null if the city isn't in the
 * table or the row isn't a PH row.
 *
 * @param city        - City name string from locationBreakdown
 * @param countryCode - ISO country code from locationBreakdown (e.g. "PH")
 */
export function getCityCoordinates(city, countryCode) {
  if (!city || countryCode !== "PH") return null;

  const normalized = city.trim().toLowerCase();
  return PHILIPPINE_CITY_COORDINATES[normalized] ?? null;
}

// Default map center/zoom for the Philippines as a whole — used when
// centering the map before any location data has loaded.
export const PHILIPPINES_MAP_CENTER = [12.88, 121.77];
export const PHILIPPINES_MAP_DEFAULT_ZOOM = 5.5;
