/**
 * FILE: app/superAdmin/(protected)/content/shop/ShopListClient.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Renders the Resort Shop Management page: category tabs (All /
 * Alcohol / Snacks / Non-Alcoholic / Essentials / Souvenirs / Ice), the
 * DataTable of products for the active tab, a delete confirmation
 * modal, the Shop Configuration panel, and the toast stack.
 *
 * DATA FLOW:
 * 1. useShopProducts() fetches all products on mount; the active tab
 *    filters them client-side (no re-fetch per tab switch)
 * 2. useShopConfig() fetches/saves the singleton shop hours/location/
 *    alcohol-warning row
 * 3. Clicking a row navigates to the edit page for that product
 * 4. Clicking "Delete" opens ConfirmationModal; confirming calls
 *    deleteProduct() then shows a success/error toast
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useShopProducts } from "@/hooks/useShopProducts";
import { useShopConfig } from "@/hooks/useShopConfig";
import { useToast } from "@/app/superAdmin/shared/useToast";
import ToastStack from "@/app/superAdmin/shared/ToastStack";
import DataTable from "@/components/superAdmin/DataTable";
import StatusBadge from "@/components/superAdmin/StatusBadge";
import ConfirmationModal from "@/components/superAdmin/ConfirmationModal";

const CATEGORY_TABS = [
  { value: "all", label: "All" },
  { value: "alcohol", label: "Alcohol" },
  { value: "snacks", label: "Snacks" },
  { value: "non_alcoholic", label: "Non-Alcoholic" },
  { value: "essentials", label: "Essentials" },
  { value: "souvenirs", label: "Souvenirs" },
  { value: "ice", label: "Ice" },
];

export default function ShopListClient() {
  const router = useRouter();
  const { products, isLoading, error, deleteProduct } = useShopProducts();
  const { config, isLoading: isConfigLoading, saveConfig } = useShopConfig();
  const { toasts, showToast, dismissToast } = useToast();

  const [activeTab, setActiveTab] = useState("all");
  // Tracks which product is pending deletion so ConfirmationModal knows
  // what to show and what to delete when confirmed.
  const [productPendingDelete, setProductPendingDelete] = useState(null);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [shopHours, setShopHours] = useState("");
  const [shopLocation, setShopLocation] = useState("");
  const [alcoholWarningText, setAlcoholWarningText] = useState("");
  const [hasHydratedConfig, setHasHydratedConfig] = useState(false);

  // Hydrate local config form fields once, the first time the fetched
  // config arrives — never overwrite in-progress admin edits on refetch.
  useEffect(() => {
    if (config && !hasHydratedConfig) {
      setShopHours(config.shopHours ?? "");
      setShopLocation(config.shopLocation ?? "");
      setAlcoholWarningText(config.alcoholWarningText ?? "");
      setHasHydratedConfig(true);
    }
  }, [config, hasHydratedConfig]);

  const filteredProducts = useMemo(
    () => (activeTab === "all" ? products : products.filter((product) => product.category === activeTab)),
    [products, activeTab]
  );

  async function handleConfirmDelete() {
    try {
      await deleteProduct(productPendingDelete.id);
      showToast(`✓ "${productPendingDelete.name}" deleted successfully.`, "success");
    } catch {
      showToast("✕ Failed to delete product.", "error");
    } finally {
      setProductPendingDelete(null);
    }
  }

  async function handleSaveConfig(event) {
    event.preventDefault();
    setIsSavingConfig(true);
    try {
      await saveConfig({ shopHours, shopLocation, alcoholWarningText });
      showToast("✓ Shop configuration saved successfully.", "success");
    } catch {
      showToast("✕ We couldn't save the shop configuration. Please try again.", "error");
    } finally {
      setIsSavingConfig(false);
    }
  }

  const columns = [
    { key: "name", label: "Product Name" },
    { key: "price", label: "Price", align: "right", mono: true },
    { key: "stock", label: "In Stock?", align: "center" },
    { key: "actions", label: "Actions", align: "right" },
  ];

  const rows = filteredProducts.map((product) => ({
    id: product.id,
    name: product.name,
    price: `₱${Number(product.price).toLocaleString()}`,
    stock: <StatusBadge status={product.inStock ? "active" : "suspended"} />,
    actions: (
      <div className="shopRowActions">
        <Link
          href={`/superAdmin/content/shop/${product.id}`}
          className="shopRowActionButton"
          onClick={(event) => event.stopPropagation()}
        >
          Edit
        </Link>
        <button
          type="button"
          className="shopRowActionButton shopRowActionButton--destructive"
          onClick={(event) => {
            event.stopPropagation();
            setProductPendingDelete(product);
          }}
        >
          Delete
        </button>
      </div>
    ),
  }));

  return (
    <section className="shopSection">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <div className="shopHeaderRow">
        <div>
          <span className="shopEyebrow">Content Management</span>
          <h1 className="shopTitle">Resort Shop</h1>
        </div>
        <Link href="/superAdmin/content/shop/new" className="shopAddButton">
          + Add Product
        </Link>
      </div>

      <div className="shopTabRow" role="tablist" aria-label="Filter products by category">
        {CATEGORY_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.value}
            className={`shopTab${activeTab === tab.value ? " shopTab--active" : ""}`}
            onClick={() => setActiveTab(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        isLoading={isLoading}
        error={error}
        emptyMessage="No products yet in this category. Click “Add Product” to create the first one."
        onRowClick={(row) => router.push(`/superAdmin/content/shop/${row.id}`)}
      />

      <ConfirmationModal
        isOpen={Boolean(productPendingDelete)}
        title="Delete Product?"
        description={
          productPendingDelete
            ? `Are you sure you want to delete "${productPendingDelete.name}"? This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        onConfirm={handleConfirmDelete}
        onCancel={() => setProductPendingDelete(null)}
      />

      <div className="shopConfigPanel">
        <h2 className="shopConfigTitle">Shop Configuration</h2>
        {isConfigLoading ? (
          <p className="shopFormMutedText">Loading configuration…</p>
        ) : (
          <form onSubmit={handleSaveConfig} className="shopConfigForm">
            <div className="shopFormField">
              <label htmlFor="shopHours">Shop Hours</label>
              <input
                id="shopHours"
                type="text"
                placeholder="e.g. 7:00 AM – 10:00 PM"
                value={shopHours}
                onChange={(event) => setShopHours(event.target.value)}
              />
            </div>
            <div className="shopFormField">
              <label htmlFor="shopLocation">Shop Location</label>
              <input
                id="shopLocation"
                type="text"
                placeholder="e.g. Ground floor, near lobby"
                value={shopLocation}
                onChange={(event) => setShopLocation(event.target.value)}
              />
            </div>
            <div className="shopFormField">
              <label htmlFor="alcoholWarningText">Alcohol Warning Text</label>
              <textarea
                id="alcoholWarningText"
                rows={3}
                value={alcoholWarningText}
                onChange={(event) => setAlcoholWarningText(event.target.value)}
              />
            </div>
            <div className="shopFormActions">
              <button type="submit" className="shopFormButton shopFormButton--primary" disabled={isSavingConfig}>
                {isSavingConfig ? "Saving…" : "Save Configuration"}
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
