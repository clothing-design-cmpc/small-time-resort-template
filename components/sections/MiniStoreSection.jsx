/**
 * FILE: components/sections/MiniStoreSection.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Display-only resort shop section. Browse-only — no cart, no checkout.
 * Products are drinks available at the resort bar and reception:
 * local craft beer, imported wines, spirits, sodas, and juices.
 * Guests order at the bar or through reception during their stay.
 *
 * DATA FLOW:
 * 1. Rendered inside app/visitor/page.jsx after AmenitiesHighlightSection
 * 2. Static PRODUCTS array — replace with Supabase fetch once
 *    the super-admin content panel is built
 * 3. Image src values point to Unsplash placeholders until R2 is wired
 */
import Image from "next/image";
import "./MiniStoreSection.css";

const PRODUCTS = [
  {
    id: "drink-1",
    name: "Craft Pale Ale",
    description: "A local Philippine craft ale brewed with Benguet hops. Light, citrusy, and cold — best enjoyed poolside or at the gazebo bar after sunset.",
    price: "₱180",
    badge: "Local Brew",
    badgeType: "accent",
    imageUrl: "https://images.unsplash.com/photo-1608270586620-248524c67de9?auto=format&fit=crop&w=600&q=80",
    imageAlt: "Cold craft pale ale in a frosted glass",
  },
  {
    id: "drink-2",
    name: "House Red Wine",
    description: "A smooth Chilean Merlot selected by the resort as its house pour. Pairs with the villa's evening charcuterie set. Available by the glass or bottle.",
    price: "₱320 / glass",
    badge: "House Pour",
    badgeType: "warm",
    imageUrl: "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=600&q=80",
    imageAlt: "Glass of red wine on a wooden table at sunset",
  },
  {
    id: "drink-3",
    name: "Premium Rum",
    description: "Aged dark rum from Negros Occidental, straight or over ice. The bar also mixes it into the resort's signature mojito with fresh mint from the garden.",
    price: "₱280 / shot",
    badge: "Local Spirit",
    badgeType: "earth",
    imageUrl: "https://images.unsplash.com/photo-1569529465841-dfecdab7503b?auto=format&fit=crop&w=600&q=80",
    imageAlt: "Dark rum poured over ice in a rocks glass",
  },
  {
    id: "drink-4",
    name: "Fresh Buko Juice",
    description: "Young coconut water served straight from the shell, chilled and cut to order. Naturally sweet, no added sugar. Sourced daily from the resort's own coconut grove.",
    price: "₱120",
    badge: "Fresh Daily",
    badgeType: "accent",
    imageUrl: "https://images.unsplash.com/photo-1596803244897-5e42d1ecdcf7?auto=format&fit=crop&w=600&q=80",
    imageAlt: "Fresh young coconut with a straw on a beach table",
  },
  {
    id: "drink-5",
    name: "Sparkling Water",
    description: "San Pellegrino sparkling mineral water, 750ml. Cold, clean, and fizzy. Available at reception anytime or delivered to the villa on request.",
    price: "₱95",
    badge: null,
    badgeType: null,
    imageUrl: "https://images.unsplash.com/photo-1523362628745-0c100150b504?auto=format&fit=crop&w=600&q=80",
    imageAlt: "Sparkling mineral water bottle with a glass on ice",
  },
  {
    id: "drink-6",
    name: "Mango Soda",
    description: "Local canned mango soda made from Philippine carabao mangoes. Bright, sweet, and nostalgic. A resort favorite with kids and adults alike.",
    price: "₱80",
    badge: "Guest Fave",
    badgeType: "warm",
    imageUrl: "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=600&q=80",
    imageAlt: "Chilled mango soda cans in a cooler with ice",
  },
];

export default function MiniStoreSection() {
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

        {/* Product grid */}
        <div className="miniStoreGrid">
          {PRODUCTS.map((product) => (
            <article key={product.id} className="miniStoreCard">

              {/* Product image */}
              <div className="miniStoreImageWrapper">
                <Image
                  src={product.imageUrl}
                  alt={product.imageAlt}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="miniStoreImage"
                />
                {/* Badge overlay */}
                {product.badge && (
                  <span className={`miniStoreBadge miniStoreBadge--${product.badgeType}`}>
                    {product.badge}
                  </span>
                )}
              </div>

              {/* Card body */}
              <div className="miniStoreCardBody">
                <h3 className="miniStoreProductName">{product.name}</h3>
                <p className="miniStoreProductDesc">{product.description}</p>
                <div className="miniStoreCardFooter">
                  <span className="miniStorePrice">{product.price}</span>
                  <span className="miniStoreAvailabilityTag">At the bar</span>
                </div>
              </div>

            </article>
          ))}
        </div>

        {/* Footer note */}
        <p className="miniStoreFootnote">
          All drinks are available at the gazebo bar, pool bar, or via
          in-villa delivery. Ask our team about pairings or custom orders.
        </p>

      </div>
    </section>
  );
}
