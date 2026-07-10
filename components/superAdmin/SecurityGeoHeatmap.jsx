/**
 * FILE: components/superAdmin/SecurityGeoHeatmap.jsx
 * ROLE: Super-admin — shared UI, protected by middleware.js auth guard
 *
 * PURPOSE:
 * Horizontal bar heatmap showing which countries security events have
 * originated from, so an admin can spot an unexpected concentration of
 * activity (e.g. a sudden spike from a country no guest or admin has
 * ever logged in from) at a glance, before drilling into the table.
 *
 * A full geographic map is intentionally not used here — it would pull
 * in a mapping library and tile service for a control-center page that
 * only needs relative comparison between countries, not exact
 * coordinates on a globe. Bar length + color intensity communicates
 * "which countries dominate the log" just as clearly.
 *
 * DATA FLOW:
 * 1. Receives `data` (the { heatmap } array from the geo-summary
 *    endpoint) and `isLoading` as props — SecurityLogsClient owns the
 *    fetch, this component is purely presentational
 * 2. Bar width and background intensity both scale against the
 *    highest count in the set, so the busiest country is always a
 *    full-width, full-intensity bar regardless of the absolute numbers
 */
import "./SecurityGeoHeatmap.css";

export default function SecurityGeoHeatmap({ data = [], isLoading = false }) {
  if (isLoading) {
    return (
      <div className="securityGeoHeatmap securityGeoHeatmap--loading">
        {Array.from({ length: 5 }).map((_, index) => (
          <span key={index} className="securityGeoHeatmapSkeletonRow" />
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="securityGeoHeatmap securityGeoHeatmap--empty">
        <p>No geolocation data recorded yet.</p>
      </div>
    );
  }

  const maxCount = Math.max(...data.map((row) => row.count));

  return (
    <div className="securityGeoHeatmap">
      {data.map((row) => {
        // 0.15–1.0 range so even the smallest bar keeps a visible tint
        // instead of fading to nothing against the surface background.
        const intensity = 0.15 + 0.85 * (row.count / maxCount);
        return (
          <div key={row.country} className="securityGeoHeatmapRow">
            <span className="securityGeoHeatmapCountry">
              {row.countryCode && (
                <span className="securityGeoHeatmapCode adminMono">{row.countryCode}</span>
              )}
              {row.country}
            </span>
            <div className="securityGeoHeatmapBarTrack">
              <div
                className="securityGeoHeatmapBarFill"
                style={{
                  width: `${(row.count / maxCount) * 100}%`,
                  backgroundColor: `rgba(59, 130, 246, ${intensity})`,
                }}
              />
            </div>
            <span className="securityGeoHeatmapCount adminMono">{row.count}</span>
          </div>
        );
      })}
    </div>
  );
}
