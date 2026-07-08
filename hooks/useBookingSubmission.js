/**
 * FILE: hooks/useBookingSubmission.js
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Wraps the two booking mutations — live price preview (/quote) and
 * final submission (/bookings) — so BookingFormClient never calls
 * axios directly (Rule 31.2). Both throw with a guest-facing .message
 * on failure so the form can show it inline.
 */
"use client";

import { useCallback, useState } from "react";
import axios from "axios";

export function useBookingSubmission() {
  const [isQuoting, setIsQuoting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchQuote = useCallback(async (payload) => {
    setIsQuoting(true);
    try {
      const response = await axios.post("/api/bookings/quote", payload);
      return response.data.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || "Couldn't calculate a quote. Please try again.");
    } finally {
      setIsQuoting(false);
    }
  }, []);

  const submitBooking = useCallback(async (payload) => {
    setIsSubmitting(true);
    try {
      const response = await axios.post("/api/bookings", payload);
      return response.data.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || "Couldn't complete your booking. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  return { fetchQuote, submitBooking, isQuoting, isSubmitting };
}
