/**
 * FILE: app/superAdmin/(protected)/content/shop/page.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Resort Shop Management (blueprint Page 3). Category-tabbed product
 * list plus a Shop Configuration panel (hours, location, alcohol
 * warning text). "Add Product" links to the create form.
 *
 * DATA FLOW:
 * 1. ShopListClient (Client Component) owns data fetching via
 *    useShopProducts() and useShopConfig()
 * 2. This file is the thin Server Component route entry — no data
 *    fetching happens here directly
 */
import "./Shop.css";
import ShopListClient from "./ShopListClient";

export const metadata = {
  title: "Resort Shop | Super-Admin | your-private-resort",
};

export default function ShopManagementPage() {
  return <ShopListClient />;
}
