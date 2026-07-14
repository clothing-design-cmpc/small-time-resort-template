/**
 * FILE: app/superAdmin/(protected)/content/shop/ShopProductForm.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Create/Edit form for a single shop product (blueprint Page 3).
 * Shared by the "new" and "[productId]" routes — `existingProduct` is
 * null for create mode. Handles image upload to R2 (aspect 1:1).
 *
 * DATA FLOW:
 * 1. React Hook Form + Zod validate the fields on submit (Rule 31.7)
 * 2. If a new image file was chosen, it's uploaded to
 *    /api/superAdmin/content/upload first — the returned url/key are
 *    then included in the product payload
 * 3. POST (create) or PUT (edit) to /api/superAdmin/content/shop —
 *    on success, show a toast and redirect back to the list
 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import axios from "axios";
import Image from "next/image";
import { useToast } from "@/app/superAdmin/shared/useToast";
import ToastStack from "@/app/superAdmin/shared/ToastStack";
import "./Shop.css";

const CATEGORIES = [
  { value: "alcohol", label: "Alcohol" },
  { value: "snacks", label: "Snacks" },
  { value: "non_alcoholic", label: "Non-Alcoholic" },
  { value: "essentials", label: "Essentials" },
  { value: "souvenirs", label: "Souvenirs" },
  { value: "ice", label: "Ice" },
  { value: "general", label: "General" },
];

const productSchema = z.object({
  name: z.string().min(1, "Product name is required."),
  category: z.string().min(1, "Category is required."),
  price: z.coerce.number().min(0, "Price must be 0 or more."),
  description: z.string().optional(),
  quantityOnHand: z.coerce.number().min(0),
  inStock: z.boolean(),
  isActive: z.boolean(),
});

export default function ShopProductForm({ existingProduct }) {
  const router = useRouter();
  const { toasts, showToast, dismissToast } = useToast();
  const isEditMode = Boolean(existingProduct);

  const [imagePreviewUrl, setImagePreviewUrl] = useState(existingProduct?.imageUrl ?? null);
  const [selectedImageFile, setSelectedImageFile] = useState(null);

  // If this product's saved category isn't one of the known options
  // (e.g. it was created before this list existed, or via direct DB
  // seed), add it as an extra option so the select shows the real
  // current value instead of rendering blank with nothing selected.
  const categoryOptions =
    existingProduct?.category && !CATEGORIES.some((c) => c.value === existingProduct.category)
      ? [...CATEGORIES, { value: existingProduct.category, label: existingProduct.category }]
      : CATEGORIES;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: existingProduct?.name ?? "",
      category: existingProduct?.category ?? "general",
      price: existingProduct?.price ?? 0,
      description: existingProduct?.description ?? "",
      quantityOnHand: existingProduct?.quantityOnHand ?? 0,
      inStock: existingProduct?.inStock ?? true,
      isActive: existingProduct?.isActive ?? true,
    },
  });

  function handleImageChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setSelectedImageFile(file);
    setImagePreviewUrl(URL.createObjectURL(file));
  }

  /**
   * onSubmit
   * Uploads the image first (if a new one was chosen), then creates or
   * updates the product with the resulting URL/key plus all form fields.
   */
  async function onSubmit(data) {
    try {
      let imageUrl = existingProduct?.imageUrl ?? null;
      let imageKey = existingProduct?.imageKey ?? null;

      if (selectedImageFile) {
        const uploadFormData = new FormData();
        uploadFormData.append("file", selectedImageFile);
        uploadFormData.append("folder", "shop");

        const uploadResponse = await axios.post("/api/superAdmin/content/upload", uploadFormData);
        imageUrl = uploadResponse.data.data.url;
        imageKey = uploadResponse.data.data.key;
      }

      const payload = { ...data, imageUrl, imageKey, sortOrder: existingProduct?.sortOrder ?? 0 };

      if (isEditMode) {
        await axios.put(`/api/superAdmin/content/shop/${existingProduct.id}`, payload);
        showToast("✓ Product updated successfully.", "success");
      } else {
        await axios.post("/api/superAdmin/content/shop", payload);
        showToast(`✓ Product "${data.name}" added successfully.`, "success");
      }

      router.push("/superAdmin/content/shop");
    } catch (submitError) {
      const message = submitError?.response?.data?.message || "We couldn't save this product. Please try again.";
      showToast(`✕ ${message}`, "error");
    }
  }

  return (
    <section className="shopFormSection">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <div className="shopFormHeaderRow">
        <span className="shopEyebrow">Content Management</span>
        <h1 className="shopTitle">{isEditMode ? "Edit Product" : "Add Product"}</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="shopForm">
        <div className="shopFormField">
          <label htmlFor="productName">Product Name <span aria-hidden="true">*</span></label>
          <input id="productName" type="text" autoFocus {...register("name")} />
          {errors.name && <span role="alert" className="shopFormError">{errors.name.message}</span>}
        </div>

        <div className="shopFormRow">
          <div className="shopFormField">
            <label htmlFor="productCategory">Category <span aria-hidden="true">*</span></label>
            <select id="productCategory" {...register("category")}>
              {categoryOptions.map((category) => (
                <option key={category.value} value={category.value}>{category.label}</option>
              ))}
            </select>
          </div>

          <div className="shopFormField">
            <label htmlFor="productPrice">Price (₱) <span aria-hidden="true">*</span></label>
            <input id="productPrice" type="number" step="0.01" {...register("price")} />
            {errors.price && <span role="alert" className="shopFormError">{errors.price.message}</span>}
          </div>

          <div className="shopFormField">
            <label htmlFor="productQuantity">Quantity on Hand</label>
            <input id="productQuantity" type="number" {...register("quantityOnHand")} />
          </div>
        </div>

        <div className="shopFormField">
          <label htmlFor="productDescription">Description</label>
          <textarea id="productDescription" rows={4} {...register("description")} />
        </div>

        <div className="shopFormField">
          <label htmlFor="productImage">Product Image (1:1)</label>
          <div className="shopFormImageUpload">
            {imagePreviewUrl && (
              <div className="shopFormImagePreviewWrapper">
                {/* unoptimized for a freshly-selected local file — its blob: URL
                    is never a configured remote host for next/image to optimize */}
                <Image
                  src={imagePreviewUrl}
                  alt="Product preview"
                  fill
                  sizes="140px"
                  style={{ objectFit: "cover" }}
                  unoptimized={Boolean(selectedImageFile)}
                />
              </div>
            )}
            <input id="productImage" type="file" accept="image/*" onChange={handleImageChange} />
          </div>
        </div>

        <div className="shopFormToggleRow">
          <label className="shopFormToggle">
            <input type="checkbox" {...register("inStock")} />
            In stock
          </label>
          <label className="shopFormToggle">
            <input type="checkbox" {...register("isActive")} />
            Visible to guests (active)
          </label>
        </div>

        <div className="shopFormActions">
          <button
            type="button"
            className="shopFormButton shopFormButton--neutral"
            onClick={() => router.push("/superAdmin/content/shop")}
          >
            Cancel
          </button>
          <button type="submit" className="shopFormButton shopFormButton--primary" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </form>
    </section>
  );
}
