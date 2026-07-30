/**
 * FILE: app/api/superAdmin/content/shop/route.js
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * GET  -> returns every shop product, ordered by sortOrder, for the
 *         Shop Management list page.
 * POST -> creates a new product. The image (if any) is already
 *         uploaded to R2 by the client beforehand — this only saves
 *         the resulting imageUrl/imageKey plus the rest of the form.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireSuperAdmin } from "@/services/adminSession";
import { logAuditEvent } from "@/services/auditLog";

export async function GET() {
  try {
    const products = await prisma.storeProduct.findMany({
      orderBy: { sortOrder: "asc" },
    });
    return NextResponse.json({ success: true, data: products, message: "Products fetched successfully." });
  } catch (error) {
    console.error("[Shop] Failed to fetch:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't load the products. Please try again." },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  const session = requireSuperAdmin(request);
  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "You don't have permission to do this." },
      { status: 401 }
    );
  }

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

    // Duplicate check — product names must be unique within their own
    // category (same rule the PUT handler enforces on rename/recategorize).
    const nameTaken = await prisma.storeProduct.findFirst({
      where: { name: { equals: name, mode: "insensitive" }, category },
    });
    if (nameTaken) {
      return NextResponse.json(
        { success: false, data: null, message: "A product with this name already exists in this category." },
        { status: 409 }
      );
    }

    // New products go to the end of the sort order by default.
    const lastProduct = await prisma.storeProduct.findFirst({ orderBy: { sortOrder: "desc" } });
    const nextSortOrder = (lastProduct?.sortOrder ?? -1) + 1;

    const product = await prisma.storeProduct.create({
      data: {
        name,
        description: body.description ?? null,
        price: body.price,
        category,
        imageUrl: body.imageUrl ?? null,
        imageKey: body.imageKey ?? null,
        isActive: body.isActive ?? true,
        inStock: body.inStock ?? true,
        quantityOnHand: body.quantityOnHand ?? 0,
        sortOrder: body.sortOrder ?? nextSortOrder,
      },
    });

    // Audit trail (Rule 6) — who added which product.
    await logAuditEvent({
      actor: session.uid,
      action: "created",
      targetType: "ShopProduct",
      targetId: product.id,
      targetName: product.name,
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
