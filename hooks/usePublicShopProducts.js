/**
 * FILE: hooks/usePublicShopProducts.js
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Fetches published shop products AND the shop configuration (hours,
 * location, alcohol warning text) for the visitor-facing Mini Store
 * section, in one request. Deliberately separate from
 * hooks/useShopProducts.js, which hits the admin-only
 * /api/superAdmin/content/shop endpoint — that route requires a
 * super-admin session and would fail for every visitor. All axios
 * calls to the public shop API happen here — never inline inside a
 * component (Rule 31.2).
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";

const PUBLIC_SHOP_ENDPOINT = "/api/shop";
const EMPTY_CONFIG = { shopHours: "", shopLocation: "", alcoholWarningText: "" };

export function usePublicShopProducts() {
  const [products, setProducts] = useState([]);
  const [config, setConfig] = useState(EMPTY_CONFIG);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchProducts = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await axios.get(PUBLIC_SHOP_ENDPOINT);
      setProducts(response.data.data?.products ?? []);
      setConfig(response.data.data?.config ?? EMPTY_CONFIG);
    } catch (fetchError) {
      setError(fetchError);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  return { products, config, isLoading, error, refetchProducts: fetchProducts };
}
