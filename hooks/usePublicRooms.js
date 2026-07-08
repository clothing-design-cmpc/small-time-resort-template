/**
 * FILE: hooks/usePublicRooms.js
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Fetches published rooms for visitor-facing pages (currently the
 * homepage's featured rooms grid). Deliberately separate from
 * hooks/useRooms.js, which hits the admin-only /api/superAdmin/content/rooms
 * endpoint — that route requires a super-admin session and would fail
 * for every visitor. All axios calls to the public rooms API happen
 * here — never inline inside a component (Rule 31.2).
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";

const PUBLIC_ROOMS_ENDPOINT = "/api/rooms";

/**
 * usePublicRooms
 * @param {boolean} featuredOnly - when true, only rooms marked
 *   isFeatured are returned (used by the homepage grid). When false,
 *   every published room is returned (used by a future full listing page).
 */
export function usePublicRooms(featuredOnly = false) {
  const [rooms, setRooms] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchRooms = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await axios.get(PUBLIC_ROOMS_ENDPOINT, {
        params: featuredOnly ? { featured: "true" } : undefined,
      });
      setRooms(response.data.data ?? []);
    } catch (fetchError) {
      setError(fetchError);
    } finally {
      setIsLoading(false);
    }
  }, [featuredOnly]);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  return { rooms, isLoading, error, refetchRooms: fetchRooms };
}
