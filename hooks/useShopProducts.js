/**
 * FILE: hooks/useShopProducts.js
 * ROLE: Super-admin — client data hook, protected by middleware.js auth guard
 *
 * PURPOSE:
 * Fetches the shop product list for the Resort Shop Management page
 * and exposes a deleteProduct mutation. All axios calls to the shop
 * API happen here — never inline inside a component (Rule 31.2).
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";

const SHOP_ENDPOINT = "/api/superAdmin/content/shop";

export function useShopProducts() {
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  /**
   * fetchProducts
   * Loads every product from the API. Runs on mount and again after
   * any create/update/delete so the list always reflects the latest data.
   */
  const fetchProducts = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await axios.get(SHOP_ENDPOINT);
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

  /**
   * deleteProduct
   * Deletes a product by ID and refreshes the list.
   */
  const deleteProduct = useCallback(
    async (productId) => {
      const response = await axios.delete(`${SHOP_ENDPOINT}/${productId}`);
      await fetchProducts();
      return response.data;
    },
    [fetchProducts]
  );

  return { products, isLoading, error, refetchProducts: fetchProducts, deleteProduct };
}
