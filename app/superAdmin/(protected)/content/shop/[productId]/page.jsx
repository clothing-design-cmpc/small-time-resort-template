/**
 * FILE: app/superAdmin/(protected)/content/shop/[productId]/page.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Edit-product route. Fetches the product server-side (fresh, no
 * cache), then hands off to the shared ShopProductForm in edit mode.
 * Calls notFound() if the product ID doesn't exist.
 */
import { notFound } from "next/navigation";
import { prisma } from "@/services/prisma";
import ShopProductForm from "../ShopProductForm";

export async function generateMetadata({ params }) {
  const { productId } = await params;
  const product = await prisma.storeProduct.findUnique({ where: { id: productId } });
  return { title: product ? `Edit ${product.name} | Super-Admin` : "Product Not Found | Super-Admin" };
}

export default async function EditShopProductPage({ params }) {
  const { productId } = await params;

  const product = await prisma.storeProduct.findUnique({ where: { id: productId } });

  if (!product) {
    notFound();
  }

  // Decimal fields from Prisma aren't serializable as-is across the
  // Server -> Client Component boundary — convert to a plain number.
  const serializedProduct = { ...product, price: Number(product.price) };

  return <ShopProductForm existingProduct={serializedProduct} />;
}
