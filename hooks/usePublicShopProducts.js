/**
 * FILE: hooks/usePublicShopProducts.js
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Fetches published shop products for the visitor-facing Mini Store
 * section. Deliberately separate from hooks/useShopProducts.js, which
 * hits the admin-only /api/superAdmin/content/shop endpoint — that
 * route requires a super-admin session and would fail for every
 * visitor. All axios calls to the public shop API happen here — never
 * inline inside a component (Rule 31.2).
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";

const PUBLIC_SHOP_ENDPOINT = "/api/shop";

export function usePublicShopProducts() {
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchProducts = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await axios.get(PUBLIC_SHOP_ENDPOINT);
      setProducts(response.data.data ?? []);
    } catch (fetchError) {
      setError(fetchError);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  return { products, isLoading, error, refetchProducts: fetchProducts };
}
