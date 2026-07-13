/**
 * FILE: app/api/superAdmin/content/shop/route.js
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * GET  -> returns every shop product, in display order, for the
 *         Resort Shop Management list page (blueprint Page 10).
 * POST -> creates a new product. Rejects a duplicate name within the
 *         same category (case-insensitive) before saving.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireSuperAdmin } from "@/services/adminSession";
import { logSecurityEvent } from "@/services/securityLog";

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
    const category = body.category || "general";

    if (!name) {
      return NextResponse.json(
        { success: false, data: null, message: "Product name is required." },
        { status: 400 }
      );
    }

    // Pre-save duplicate check (Rule 6) — case-insensitive, normalized,
    // scoped to the same category so "Water" can exist in both
    // "beverages" and "essentials" without colliding.
    const nameTaken = await prisma.storeProduct.findFirst({
      where: { name: { equals: name, mode: "insensitive" }, category },
    });
    if (nameTaken) {
      return NextResponse.json(
        { success: false, data: null, message: "A product with this name already exists in this category." },
        { status: 409 }
      );
    }

    // New products go to the end of the display order by default so
    // they don't jump ahead of existing ones on the visitor shop page.
    const lastProduct = await prisma.storeProduct.findFirst({ orderBy: { sortOrder: "desc" } });
    const nextSortOrder = (lastProduct?.sortOrder ?? -1) + 1;

    const product = await prisma.storeProduct.create({
      data: {
        name,
        description: body.description ?? null,
        price: body.price,
        category,
        imageUrl: body.imageUrl ?? null,
        inStock: body.inStock ?? true,
        quantityOnHand: body.quantityOnHand ?? 0,
        isActive: body.isActive ?? true,
        sortOrder: body.sortOrder ?? nextSortOrder,
      },
    });

    // Audit trail (Rule 6) — who added which product, and at what price.
    const session = requireSuperAdmin(request);
    await logSecurityEvent({
      eventType: "admin_action",
      actor: session?.uid ?? null,
      request,
      details: `Added product "${product.name}" (₱${product.price}).`,
    });

    return NextResponse.json(
      { success: true, data: product, message: "Product added successfully." },
      { status: 201 }
    );
  } catch (error) {
    console.error("[Shop] Failed to create:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't add this product. Please try again." },
      { status: 500 }
    );
  }
}
