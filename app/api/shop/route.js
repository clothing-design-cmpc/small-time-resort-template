/**
 * FILE: app/api/shop/route.js
 * ROLE: Public — no auth required, called by the visitor site
 *
 * PURPOSE:
 * Read-only shop product listing for visitors. This is intentionally a
 * separate endpoint from /api/superAdmin/content/shop, which is the
 * admin CRUD route protected by middleware.js. This route only ever
 * returns products marked isActive (published) and never exposes
 * admin-only fields like imageKey or quantityOnHand.
 *
 * DATA FLOW:
 * 1. hooks/usePublicShopProducts.js calls GET /api/shop
 * 2. Query is scoped to isActive products only, ordered by category
 *    then sortOrder
 * 3. Response is trimmed to the fields the visitor UI actually renders
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";

export async function GET() {
  try {
    const products = await prisma.storeProduct.findMany({
      where: { isActive: true },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
      select: {
        id: true,
        name: true,
        description: true,
        price: true,
        category: true,
        imageUrl: true,
        inStock: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: products,
      message: "Products fetched successfully.",
    });
  } catch (error) {
    console.error("[api/shop] Failed to fetch:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't load the shop. Please try again." },
      { status: 500 }
    );
  }
}
