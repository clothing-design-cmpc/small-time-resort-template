/**
 * FILE: app/api/superAdmin/content/shop/route.js
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * GET  -> returns every shop product, newest first, for the Resort
 *         Shop Management list page (client filters by category tab).
 * POST -> creates a new product. Name is checked for uniqueness within
 *         its category before insert (Rule 6 — pre-save duplicate check).
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";

export async function GET() {
  try {
    const products = await prisma.storeProduct.findMany({
      orderBy: { sortOrder: "asc" },
    });
    return NextResponse.json({ success: true, data: products, message: "Products fetched successfully." });
  } catch (error) {
    console.error("[Shop] Failed to fetch:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't load the shop products. Please try again." },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const name = body.name?.trim();

    if (!name || body.price == null) {
      return NextResponse.json(
        { success: false, data: null, message: "Product name and price are required." },
        { status: 400 }
      );
    }

    // Pre-save duplicate check, scoped to the same category — never
    // rely on the DB unique constraint alone (Rule 6).
    const existingProduct = await prisma.storeProduct.findFirst({
      where: { name: { equals: name, mode: "insensitive" }, category: body.category || "general" },
    });
    if (existingProduct) {
      return NextResponse.json(
        { success: false, data: null, message: "A product with this name already exists in this category." },
        { status: 409 }
      );
    }

    const product = await prisma.storeProduct.create({
      data: {
        name,
        description: body.description || null,
        price: body.price,
        category: body.category || "general",
        imageUrl: body.imageUrl || null,
        imageKey: body.imageKey || null,
        inStock: body.inStock ?? true,
        quantityOnHand: body.quantityOnHand ?? 0,
        isActive: body.isActive ?? true,
        sortOrder: body.sortOrder ?? 0,
      },
    });

    return NextResponse.json(
      { success: true, data: product, message: "Product created successfully." },
      { status: 201 }
    );
  } catch (error) {
    console.error("[Shop] Failed to create:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't create the product. Please try again." },
      { status: 500 }
    );
  }
}
