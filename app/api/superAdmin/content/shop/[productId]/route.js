/**
 * FILE: app/api/superAdmin/content/shop/[productId]/route.js
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * GET    -> fetch a single product for the edit form.
 * PUT    -> update a product. Re-checks name uniqueness within its
 *           category (excluding itself) and deletes the old R2 image
 *           if it was replaced.
 * DELETE -> deletes the product and its R2 image.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { deleteFromR2 } from "@/services/r2";
import { requireSuperAdmin } from "@/services/adminSession";
import { logSecurityEvent } from "@/services/securityLog";

export async function GET(request, { params }) {
  const { productId } = await params;

  try {
    const product = await prisma.storeProduct.findUnique({ where: { id: productId } });

    if (!product) {
      return NextResponse.json({ success: false, data: null, message: "Product not found." }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: product, message: "Product fetched successfully." });
  } catch (error) {
    console.error("[Shop] Failed to fetch:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't load this product. Please try again." },
      { status: 500 }
    );
  }
}

export async function PUT(request, { params }) {
  const { productId } = await params;

  try {
    const body = await request.json();
    const name = body.name?.trim();

    const existingProduct = await prisma.storeProduct.findUnique({ where: { id: productId } });
    if (!existingProduct) {
      return NextResponse.json({ success: false, data: null, message: "Product not found." }, { status: 404 });
    }

    // Duplicate check excludes this product's own current name+category.
    const category = body.category || existingProduct.category;
    if (name && (name.toLowerCase() !== existingProduct.name.toLowerCase() || category !== existingProduct.category)) {
      const nameTaken = await prisma.storeProduct.findFirst({
        where: { name: { equals: name, mode: "insensitive" }, category, NOT: { id: productId } },
      });
      if (nameTaken) {
        return NextResponse.json(
          { success: false, data: null, message: "A product with this name already exists in this category." },
          { status: 409 }
        );
      }
    }

    const updatedProduct = await prisma.storeProduct.update({
      where: { id: productId },
      data: {
        name: name || existingProduct.name,
        description: body.description ?? null,
        price: body.price,
        category,
        imageUrl: body.imageUrl ?? existingProduct.imageUrl,
        imageKey: body.imageKey ?? existingProduct.imageKey,
        inStock: body.inStock,
        quantityOnHand: body.quantityOnHand ?? 0,
        isActive: body.isActive,
        sortOrder: body.sortOrder ?? existingProduct.sortOrder,
      },
    });

    // The image was replaced with a new upload — remove the old R2 file
    // so the bucket never accumulates orphaned images.
    if (body.imageKey && existingProduct.imageKey && body.imageKey !== existingProduct.imageKey) {
      await deleteFromR2(existingProduct.imageKey);
    }

    // Audit trail (Rule 6) — price changes on shop products are explicitly called out.
    const session = requireSuperAdmin(request);
    await logSecurityEvent({
      eventType: "admin_action",
      actor: session?.uid ?? null,
      request,
      details: `Updated product "${existingProduct.name}" (₱${existingProduct.price} → ₱${updatedProduct.price}).`,
    });

    return NextResponse.json({ success: true, data: updatedProduct, message: "Product updated successfully." });
  } catch (error) {
    console.error("[Shop] Failed to update:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't save the changes. Please try again." },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  const { productId } = await params;

  try {
    const product = await prisma.storeProduct.findUnique({ where: { id: productId } });
    if (!product) {
      return NextResponse.json({ success: false, data: null, message: "Product not found." }, { status: 404 });
    }

    await prisma.storeProduct.delete({ where: { id: productId } });

    if (product.imageKey) {
      await deleteFromR2(product.imageKey);
    }

    // Audit trail (Rule 6) — deletions are the most important action to trace.
    const session = requireSuperAdmin(request);
    await logSecurityEvent({
      eventType: "admin_action",
      actor: session?.uid ?? null,
      request,
      details: `Deleted product "${product.name}".`,
    });

    return NextResponse.json({ success: true, data: null, message: "Product deleted successfully." });
  } catch (error) {
    console.error("[Shop] Failed to delete:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't delete this product. Please try again." },
      { status: 500 }
    );
  }
}
