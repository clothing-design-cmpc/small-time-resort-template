/**
 * FILE: components/sections/MiniStoreSection.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Display-only resort shop section. Browse-only — no cart, no checkout.
 * Guests order at the bar or through reception during their stay.
 *
 * DATA FLOW:
 * 1. Rendered inside app/visitor/page.jsx after AmenitiesHighlightSection
 * 2. On mount, usePublicShopProducts() fetches GET /api/shop — the same
 *    Resort Shop data the super-admin manages under Content > Resort
 *    Shop, filtered to isActive. Replaces the old hardcoded PRODUCTS
 *    constant that lived directly in this file.
 * 3. Renders a loading skeleton, an error state with retry, an empty
 *    state (no products marked active yet), or the real grid (Rule 25)
 */
"use client";

import Image from "next/image";
import { usePublicShopProducts } from "@/hooks/usePublicShopProducts";
import "./MiniStoreSection.css";

/* Formats a number as Philippine Peso */
function formatPrice(amount) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 0,
  }).format(amount);
}

export default function MiniStoreSection() {
  const { products, isLoading, error, refetchProducts } = usePublicShopProducts();

  return (
    <section className="miniStoreSection" id="shop">
      <div className="miniStoreContainer">

        {/* Section header */}
        <div className="miniStoreHeader">
          <span className="miniStoreEyebrow">Resort Shop</span>
          <h2 className="miniStoreTitle">Drinks at the Bar</h2>
          <p className="miniStoreSubtitle">
            Cold drinks, local brews, and classic pours — available at the
            gazebo bar, pool bar, or delivered to your villa anytime.
          </p>
        </div>

        {/* Loading skeleton — mirrors the card grid shape */}
        {isLoading && (
          <div className="miniStoreGrid">
            {[0, 1, 2].map((i) => (
              <div key={i} className="miniStoreCardSkeleton skeletonBlock" />
            ))}
          </div>
        )}

        {/* Error state — fetch failed, offer a retry */}
        {!isLoading && error && (
          <div className="miniStoreErrorState">
            <p className="miniStoreErrorMessage">
              We couldn&apos;t load the shop right now. Please try again.
            </p>
            <button type="button" className="miniStoreRetryButton" onClick={refetchProducts}>
              Try again
            </button>
          </div>
        )}

        {/* Empty state — no products marked active yet */}
        {!isLoading && !error && products.length === 0 && (
          <div className="miniStoreEmptyState">
            <p className="miniStoreEmptyTitle">Nothing on the shelf yet.</p>
            <p className="miniStoreEmptySubtitle">
              Check back soon — new drinks are added regularly.
            </p>
          </div>
        )}

        {/* Product grid */}
        {!isLoading && !error && products.length > 0 && (
          <div className="miniStoreGrid">
            {products.map((product) => (
              <article key={product.id} className="miniStoreCard">

                {/* Product image */}
                <div className="miniStoreImageWrapper">
                  {product.imageUrl ? (
                    <Image
                      src={product.imageUrl}
                      alt={product.name}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="miniStoreImage"
                    />
                  ) : (
                    <div className="miniStoreImagePlaceholder" aria-hidden="true" />
                  )}
                  {/* Availability overlay */}
                  {!product.inStock && (
                    <span className="miniStoreBadge miniStoreBadge--unavailable">
                      Unavailable
                    </span>
                  )}
                </div>

                {/* Card body */}
                <div className="miniStoreCardBody">
                  <h3 className="miniStoreProductName">{product.name}</h3>
                  {product.description && (
                    <p className="miniStoreProductDesc">{product.description}</p>
                  )}
                  <div className="miniStoreCardFooter">
                    <span className="miniStorePrice">{formatPrice(product.price)}</span>
                    <span className="miniStoreAvailabilityTag">
                      {product.inStock ? "At the bar" : "Currently unavailable"}
                    </span>
                  </div>
                </div>

              </article>
            ))}
          </div>
        )}

        {/* Footer note */}
        <p className="miniStoreFootnote">
          All drinks are available at the gazebo bar, pool bar, or via
          in-villa delivery. Ask our team about pairings or custom orders.
        </p>

      </div>
    </section>
  );
}
