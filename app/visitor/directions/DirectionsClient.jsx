/**
 * FILE: app/visitor/directions/DirectionsClient.jsx
 * ROLE: Visitor — public, no auth required, but content is GATED
 *
 * PURPOSE:
 * The actual "How to Get There" widget (villa-azure-ai-insight-and-
 * directions-plan.txt, Part 2, steps 4-6):
 *   Step A — visitor supplies their location (browser geolocation,
 *            libre/free, tried first) or types a manual address
 *   Step B — visitor enters the reference code from their invoice
 *   "Verify" — checks the code against /api/bookings/verify-reference;
 *            only on success does the Directions section render at all
 * The actual route (distance/ETA/turn-by-turn) is fetched separately
 * from /api/directions/compute, which independently re-verifies the
 * code server-side — this component's "verified" state is a UX
 * convenience only, never the real security boundary.
 *
 * DATA FLOW:
 * 1. handleUseMyLocation() calls navigator.geolocation (free, no API
 *    call spent) — falls back to the manual address field if declined
 * 2. handleVerify() POSTs the reference code; on valid:true, reveals
 *    the "Get Directions" button
 * 3. handleGetDirections() POSTs to /api/directions/compute with the
 *    resolved origin + reference code, renders the returned route
 */
"use client";

import { useState } from "react";
import axios from "axios";
import { useToast } from "@/app/visitor/shared/useToast";
import ToastStack from "@/app/visitor/shared/ToastStack";
import "./Directions.css";

function formatDistance(meters) {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${meters} m`;
}

function formatDuration(seconds) {
  const minutes = Math.round(seconds / 60);
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours} hr ${remainingMinutes} min`;
  }
  return `${minutes} min`;
}

export default function DirectionsClient() {
  const { toasts, showToast, dismissToast } = useToast();

  const [referenceCode, setReferenceCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [guestFirstName, setGuestFirstName] = useState("");
  // True once verify-reference reports this booking's directions were
  // already computed once before — /api/directions/compute will then
  // serve the saved snapshot instead of spending another Maps API call.
  const [isCached, setIsCached] = useState(false);

  const [locationMode, setLocationMode] = useState("auto"); // "auto" | "manual"
  const [manualAddress, setManualAddress] = useState("");
  const [autoCoords, setAutoCoords] = useState(null);
  const [isLocating, setIsLocating] = useState(false);

  const [isComputing, setIsComputing] = useState(false);
  const [route, setRoute] = useState(null);

  /**
   * handleUseMyLocation
   * Tries browser-native geolocation first (Rule "free device location
   * default" from the plan's cost-control suggestion). Falls back to
   * the manual address field if the visitor declines the permission
   * prompt or their browser doesn't support it.
   */
  function handleUseMyLocation() {
    if (!navigator.geolocation) {
      setLocationMode("manual");
      showToast("Your browser doesn't support location — please type your address.", "warning");
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setAutoCoords({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        setLocationMode("auto");
        setIsLocating(false);
        showToast("✓ Location detected.", "success");
      },
      () => {
        setIsLocating(false);
        setLocationMode("manual");
        showToast("Location permission declined — please type your address instead.", "warning");
      },
      { timeout: 10000 }
    );
  }

  /**
   * handleVerify
   * Confirms the reference code is real and still valid (not
   * cancelled) before revealing the Directions section at all.
   */
  async function handleVerify() {
    if (!referenceCode.trim()) {
      showToast("Please enter your reference code.", "error");
      return;
    }

    setIsVerifying(true);
    try {
      const response = await axios.post("/api/bookings/verify-reference", { referenceCode: referenceCode.trim() });
      const { valid, guestFirstName: name, cached, availableFrom } = response.data.data;

      if (valid) {
        setIsVerified(true);
        setIsCached(!!cached);
        setGuestFirstName(name || "");
        showToast(cached ? "✓ Verified — showing your saved directions." : "✓ Reference code verified.", "success");
      } else if (availableFrom) {
        // Real, confirmed booking — just too early. Show the exact date
        // instead of the generic "not found" message, per the raw ISO
        // date the API returns.
        const formattedDate = new Date(availableFrom).toLocaleDateString(undefined, {
          month: "long",
          day: "numeric",
          year: "numeric",
        });
        showToast(`Directions open starting ${formattedDate} — please check back closer to your visit.`, "warning");
      } else {
        showToast(response.data.message || "That reference code wasn't found.", "error");
      }
    } catch (error) {
      showToast(error.response?.data?.message || "Couldn't verify your code. Please try again.", "error");
    } finally {
      setIsVerifying(false);
    }
  }

  /**
   * handleGetDirections
   * Sends whichever origin is currently resolved (auto coordinates or
   * a manually typed address) along with the reference code — the
   * server re-verifies the code independently of this component's
   * local isVerified state.
   */
  async function handleGetDirections() {
    // On a cache hit, /api/directions/compute ignores whatever origin
    // is sent and returns the saved snapshot from the first request —
    // so a cached guest isn't required to grant location/type an
    // address again. A placeholder address still satisfies the API's
    // required-origin schema.
    const origin = isCached
      ? { address: manualAddress.trim() || "cached" }
      : locationMode === "auto" && autoCoords
        ? autoCoords
        : { address: manualAddress.trim() };

    if (!isCached && locationMode === "manual" && !manualAddress.trim()) {
      showToast("Please enter your address.", "error");
      return;
    }
    if (!isCached && locationMode === "auto" && !autoCoords) {
      showToast("Please share your location first.", "error");
      return;
    }

    setIsComputing(true);
    try {
      const response = await axios.post("/api/directions/compute", { referenceCode: referenceCode.trim(), origin });
      setRoute(response.data.data.route);
    } catch (error) {
      showToast(error.response?.data?.message || "Couldn't calculate directions. Please try again.", "error");
    } finally {
      setIsComputing(false);
    }
  }

  return (
    <div className="directionsWidget">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      {/* Step A — Location. Skipped once verified as cached, since the
          compute route ignores origin on a cache hit and returns the
          snapshot from the guest's very first request instead. */}
      {!isCached && (
        <div className="directionsField">
          <label className="directionsLabel">Your Location</label>
          <div className="directionsLocationToggle">
            <button
              type="button"
              className={`directionsLocationOption${locationMode === "auto" ? " directionsLocationOptionActive" : ""}`}
              onClick={handleUseMyLocation}
              disabled={isLocating}
            >
              {isLocating ? "Detecting…" : autoCoords ? "✓ Using my location" : "Use my location"}
            </button>
            <button
              type="button"
              className={`directionsLocationOption${locationMode === "manual" ? " directionsLocationOptionActive" : ""}`}
              onClick={() => setLocationMode("manual")}
            >
              Enter address manually
            </button>
          </div>
          {locationMode === "manual" && (
            <input
              type="text"
              className="directionsInput"
              placeholder="e.g. 123 Rizal St, Batangas City"
              value={manualAddress}
              onChange={(event) => setManualAddress(event.target.value)}
            />
          )}
        </div>
      )}

      {/* Step B — Reference code */}
      {!isVerified && (
        <div className="directionsField">
          <label className="directionsLabel" htmlFor="referenceCode">Booking Reference Code</label>
          <div className="directionsReferenceRow">
            <input
              id="referenceCode"
              type="text"
              className="directionsInput"
              placeholder="VAR-20260724-7F3K2"
              value={referenceCode}
              onChange={(event) => setReferenceCode(event.target.value.toUpperCase())}
            />
            <button type="button" className="directionsVerifyButton" onClick={handleVerify} disabled={isVerifying}>
              {isVerifying ? "Verifying…" : "Verify"}
            </button>
          </div>
          <p className="directionsHint">Found on your booking invoice — see your confirmation email.</p>
        </div>
      )}

      {/* Gated section — only after a valid reference code */}
      {isVerified && (
        <div className="directionsGatedSection">
          <p className="directionsWelcome">
            {guestFirstName ? `Welcome back, ${guestFirstName}! ` : ""}
            {isCached
              ? "Here are the directions from your first request — saved so you can view them anytime."
              : "You're verified — get your directions below."}
          </p>
          <button
            type="button"
            className="directionsGetButton"
            onClick={handleGetDirections}
            disabled={isComputing}
          >
            {isComputing ? "Loading…" : isCached ? "View My Directions" : "Get Directions"}
          </button>

          {route && (
            <div className="directionsResult">
              {/* mapImageUrl can be null if the Static Maps call/R2 upload failed
                  server-side — the turn-by-turn list below still works without it,
                  so this never blocks. */}
              {route.mapImageUrl && (
                <img
                  src={route.mapImageUrl}
                  alt="Map showing your route to your-private-resort"
                  className="directionsMapImage"
                />
              )}
              {/* Free deep-link into the guest's own Google Maps app —
                  no API key, no per-view cost, unlike an embedded
                  interactive map (Maps JavaScript API bills per load). */}
              {route.googleMapsUrl && (
                <a
                  href={route.googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="directionsOpenMapsButton"
                >
                  Open in Google Maps
                </a>
              )}
              <div className="directionsResultSummary">
                <span><strong>{formatDistance(route.distanceMeters)}</strong> away</span>
                <span>Approx. <strong>{formatDuration(route.durationSeconds)}</strong> by car</span>
              </div>
              <ol className="directionsStepsList">
                {route.steps.map((step, index) => (
                  <li key={index} className="directionsStep">
                    {/* Routes API's navigationInstruction.instructions is plain
                        text (unlike the legacy Directions API's HTML field) —
                        rendered directly, never via dangerouslySetInnerHTML. */}
                    <span>{step.instruction}</span>
                    <span className="directionsStepDistance">{formatDistance(step.distanceMeters)}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
