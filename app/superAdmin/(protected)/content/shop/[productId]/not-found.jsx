/**
 * FILE: app/superAdmin/(protected)/content/shop/[productId]/not-found.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Shown when EditShopProductPage calls notFound() for a product ID
 * that no longer exists (deleted, or a stale/bad link).
 */
import Link from "next/link";
import "../Shop.css";

export default function ShopProductNotFound() {
  return (
    <section className="shopSection">
      <h1 className="shopTitle">Product Not Found</h1>
      <p>We couldn&apos;t find what you&apos;re looking for. It may have been deleted.</p>
      <Link href="/superAdmin/content/shop" className="shopAddButton">
        Back to Resort Shop
      </Link>
    </section>
  );
}
