/**
 * FILE: app/superAdmin/(protected)/content/shop/new/page.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Create-product route. Hands off to the shared ShopProductForm in
 * create mode.
 */
import ShopProductForm from "../ShopProductForm";

export const metadata = {
  title: "Add Product | Super-Admin | your-private-resort",
};

export default function NewShopProductPage() {
  return <ShopProductForm existingProduct={null} />;
}
