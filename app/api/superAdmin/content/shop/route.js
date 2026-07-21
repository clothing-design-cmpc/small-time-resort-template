/**
 * FILE: app/api/superAdmin/content/shop/route.js
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * GET  -> returns every shop product, ordered by category then
 *         sortOrder, for the Resort Shop Management list page.
 * POST -> creates a new product. Name is checked for uniqueness
 *         within its category before insert (Rule 6 — pre-save
 *         duplicate check), same pattern the [productId] PUT
 *         handler already uses.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireSuperAdmin } from "@/services/adminSession";
import { logSecurityEvent } from "@/services/securityLog";

export async function GET(request) {
  const session = requireSuperAdmin(request);
  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "You don't have permission to view this page." },
      { status: 401 }
    );
  }

  try {
    const products = await prisma.storeProduct.findMany({
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
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
  // Auth gate runs before any database write (Rule 1 — no independent auth
  // gate before mutation). This is a second, independent enforcement point
  // in case proxy.js's outer layer ever fails open or is misconfigured.
  const session = requireSuperAdmin(request);
  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "You don't have permission to do this." },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();

    // Normalize the name before the duplicate check so casing/whitespace
    // differences never slip past it (Rule 6 — field normalization).
    const name = body.name?.trim();
    const category = body.category || "general";

    if (!name || body.price == null) {
      return NextResponse.json(
        { success: false, data: null, message: "Product name and price are required." },
        { status: 400 }
      );
    }

    // Pre-save duplicate check — never rely on the DB unique constraint alone.
    // Uniqueness is scoped to category, matching the [productId] PUT handler.
    const nameTaken = await prisma.storeProduct.findFirst({
      where: { name: { equals: name, mode: "insensitive" }, category },
    });
    if (nameTaken) {
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
        category,
        imageUrl: body.imageUrl || null,
        imageKey: body.imageKey || null,
        inStock: body.inStock ?? true,
        quantityOnHand: body.quantityOnHand ?? 0,
        isActive: body.isActive ?? true,
        sortOrder: body.sortOrder ?? 0,
      },
    });

    // Audit trail (Rule 6) — who created which product, and when.
    // session is guaranteed non-null here since the gate above already returned early.
    await logSecurityEvent({
      eventType: "admin_action",
      actor: session.uid,
      request,
      details: `Created product "${product.name}" (₱${product.price}).`,
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
