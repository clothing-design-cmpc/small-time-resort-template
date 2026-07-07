/**
 * FILE: components/sections/MiniStoreSection.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Display-only resort merchandise section. Shows curated products guests
 * can bring home — local candles, linen sets, artisan food items, and
 * branded keepsakes. Cards are purely informational: no cart, no checkout.
 * Gives the resort a lifestyle-brand feel and surfaces upsell potential
 * for future e-commerce integration.
 *
 * DATA FLOW:
 * 1. Rendered inside app/visitor/page.jsx after AmenitiesHighlightSection
 * 2. Static PRODUCTS array — replace with a Supabase/R2 fetch once the
 *    store admin panel is built
 * 3. Image src values point to Unsplash placeholders until R2 is wired
 */
import Image from "next/image";
import "./MiniStoreSection.css";

const PRODUCTS = [
  {
    id: "prod-1",
    name: "Villa Azure Soy Candle",
    description: "Hand-poured in small batches with coconut soy wax. Scented with notes of sea salt, white jasmine, and sandalwood — the exact scent of the resort lobby.",
    price: "₱980",
    badge: "Bestseller",
    badgeType: "accent",
    imageUrl: "https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=600&q=80",
    imageAlt: "Villa Azure soy candle in a frosted glass jar",
  },
  {
    id: "prod-2",
    name: "Shoreline Linen Set",
    description: "100% stonewashed linen pillowcase pair in our signature sage tone. The same linen used on every villa bed. Pre-washed, pre-softened, ready for the first night.",
    price: "₱2,400",
    badge: "Limited",
    badgeType: "warm",
    imageUrl: "https://images.unsplash.com/photo-1631049307264-da0ec9d70304?auto=format&fit=crop&w=600&q=80",
    imageAlt: "Stonewashed linen pillowcases folded on a wooden surface",
  },
  {
    id: "prod-3",
    name: "Artisan Sea Salt",
    description: "Harvested from the cove beside the resort. Sun-dried over three tides and lightly smoked over coconut husk. 180g jar with a wooden spoon.",
    price: "₱520",
    badge: "Local",
    badgeType: "earth",
    imageUrl: "https://images.unsplash.com/photo-1574316071802-0d684efa7bf5?auto=format&fit=crop&w=600&q=80",
    imageAlt: "Glass jar of artisan sea salt with a wooden spoon",
  },
  {
    id: "prod-4",
    name: "Woven Rattan Tote",
    description: "Hand-woven by local craftspeople from sustainably harvested rattan. Wide base, natural leather handles. Holds everything from a beach day to a grocery run.",
    price: "₱1,750",
    badge: null,
    badgeType: null,
    imageUrl: "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=600&q=80",
    imageAlt: "Natural rattan woven tote bag with leather handles",
  },
  {
    id: "prod-5",
    name: "Cold Brew Concentrate",
    description: "Single-origin Benguet beans steeped for 20 hours. The same cold brew served poolside every morning. 500ml bottle, makes 8–10 cups.",
    price: "₱390",
    badge: "New",
    badgeType: "accent",
    imageUrl: "https://images.unsplash.com/photo-1578374173705-969cbe6f2d6b?auto=format&fit=crop&w=600&q=80",
    imageAlt: "Dark glass bottle of cold brew coffee concentrate",
  },
  {
    id: "prod-6",
    name: "Resort Keepsake Box",
    description: "A curated gift set: one candle, one sea salt jar, and a hand-written note card from the resort. Arrives in a reusable mango-wood box with a linen ribbon.",
    price: "₱1,650",
    badge: "Gift",
    badgeType: "warm",
    imageUrl: "https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=600&q=80",
    imageAlt: "Wooden gift box with candle and small jars inside",
  },
];

export default function MiniStoreSection() {
  return (
    <section className="miniStoreSection">
      <div className="miniStoreContainer">

        {/* Section header */}
        <div className="miniStoreHeader">
          <span className="miniStoreEyebrow">Resort Shop</span>
          <h2 className="miniStoreTitle">Take the Stillness Home</h2>
          <p className="miniStoreSubtitle">
            A small collection of things made for or inspired by the resort.
            Available at reception during your stay.
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
                  <span className="miniStoreAvailabilityTag">At reception</span>
                </div>
              </div>

            </article>
          ))}
        </div>

        {/* Footer note */}
        <p className="miniStoreFootnote">
          All items are available at the resort reception. Ask our team about
          packaging for travel or pre-ordering before arrival.
        </p>

      </div>
    </section>
  );
}
