/**
 * FILE: hooks/useTestimonials.js
 * ROLE: Super-admin — client data hook, protected by middleware.js auth guard
 *
 * PURPOSE:
 * Fetches the testimonials list for the Testimonials Management page
 * (blueprint Page 5) and exposes create/update/delete mutations. All
 * axios calls to the testimonials API happen here — never inline
 * inside a component (Rule 31.2).
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";

const TESTIMONIALS_ENDPOINT = "/api/superAdmin/content/testimonials";

export function useTestimonials() {
  const [testimonials, setTestimonials] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  /**
   * fetchTestimonials
   * Loads every testimonial from the API. Runs on mount and again
   * after any create/update/delete so the list always reflects the
   * latest data.
   */
  const fetchTestimonials = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await axios.get(TESTIMONIALS_ENDPOINT);
      setTestimonials(response.data.data ?? []);
    } catch (fetchError) {
      setError(fetchError);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTestimonials();
  }, [fetchTestimonials]);

  /**
   * createTestimonial
   * Creates a new testimonial, then refreshes the list.
   */
  const createTestimonial = useCallback(
    async (payload) => {
      const response = await axios.post(TESTIMONIALS_ENDPOINT, payload);
      await fetchTestimonials();
      return response.data;
    },
    [fetchTestimonials]
  );

  /**
   * updateTestimonial
   * Updates an existing testimonial by ID, then refreshes the list.
   */
  const updateTestimonial = useCallback(
    async (testimonialId, payload) => {
      const response = await axios.put(`${TESTIMONIALS_ENDPOINT}/${testimonialId}`, payload);
      await fetchTestimonials();
      return response.data;
    },
    [fetchTestimonials]
  );

  /**
   * deleteTestimonial
   * Deletes a testimonial by ID, then refreshes the list.
   */
  const deleteTestimonial = useCallback(
    async (testimonialId) => {
      const response = await axios.delete(`${TESTIMONIALS_ENDPOINT}/${testimonialId}`);
      await fetchTestimonials();
      return response.data;
    },
    [fetchTestimonials]
  );

  return {
    testimonials,
    isLoading,
    error,
    refetchTestimonials: fetchTestimonials,
    createTestimonial,
    updateTestimonial,
    deleteTestimonial,
  };
}
