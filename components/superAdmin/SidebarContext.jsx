/**
 * FILE: components/superAdmin/SidebarContext.jsx
 * ROLE: Super-admin — protected by middleware.js auth guard
 *
 * PURPOSE:
 * AdminHeader.jsx (the hamburger button) and Sidebar.jsx (the drawer
 * it opens/closes) are rendered as SIBLINGS inside
 * app/superAdmin/(protected)/layout.jsx — neither is an ancestor of
 * the other, so they can't share plain component state directly. This
 * context is the shared source of truth for "is the mobile sidebar
 * drawer open right now," mounted once by SidebarProvider around both
 * of them.
 *
 * On desktop (1024px+), this state is irrelevant — mediaQueries.css
 * forces the sidebar permanently visible with `transform: none
 * !important` regardless of isOpen, so nothing here needs to know or
 * care what the current viewport size is.
 *
 * DATA FLOW:
 * 1. SidebarProvider wraps <Sidebar /> and the AdminHeader/{children}
 *    column in app/superAdmin/(protected)/layout.jsx
 * 2. AdminHeader's hamburger button calls toggleSidebar()
 * 3. Sidebar reads isSidebarOpen to apply its open/closed CSS class
 *    and renders the click-to-close backdrop only while open
 * 4. Sidebar also calls closeSidebar() on every nav-link click and on
 *    every route change, so navigating never leaves the drawer stuck
 *    open over the next page
 */
"use client";

import { createContext, useContext, useState, useCallback } from "react";

const SidebarContext = createContext(null);

export function SidebarProvider({ children }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const toggleSidebar = useCallback(() => setIsSidebarOpen((current) => !current), []);
  const closeSidebar = useCallback(() => setIsSidebarOpen(false), []);

  return (
    <SidebarContext.Provider value={{ isSidebarOpen, toggleSidebar, closeSidebar }}>
      {children}
    </SidebarContext.Provider>
  );
}

/**
 * useSidebar
 * Throws a clear error instead of silently returning undefined if a
 * component ever calls this outside SidebarProvider — much easier to
 * debug than a mystery "cannot read isSidebarOpen of null" later.
 */
export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar() must be called inside <SidebarProvider>.");
  }
  return context;
}
