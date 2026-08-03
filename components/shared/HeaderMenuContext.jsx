/**
 * FILE: components/shared/HeaderMenuContext.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Header.jsx (the hamburger button + mobile dropdown) and
 * PromoAlertBanner.jsx are rendered as SIBLINGS inside
 * app/visitor/layout.jsx — neither is an ancestor of the other, so
 * they can't share plain component state directly. This context is
 * the shared source of truth for "is the mobile nav dropdown open
 * right now," mounted once by HeaderMenuProvider around both of them.
 *
 * Without this, the promo banner (position: sticky, pinned right
 * under the collapsed header's height) kept rendering in its usual
 * spot even while the dropdown was open and taller than that collapsed
 * height — visually landing in the middle of the open menu instead of
 * below it. Hiding it entirely while the menu is open is simpler and
 * more robust than trying to keep its sticky offset in sync with the
 * dropdown's animated height.
 *
 * DATA FLOW:
 * 1. HeaderMenuProvider wraps <Header /> and <PromoAlertBanner /> in
 *    app/visitor/layout.jsx
 * 2. Header's hamburger button calls toggleMobileMenu(); each mobile
 *    nav link's onClick calls closeMobileMenu()
 * 3. PromoAlertBanner reads isMobileMenuOpen and renders nothing while
 *    it's true
 */
"use client";

import { createContext, useContext, useState, useCallback } from "react";

const HeaderMenuContext = createContext(null);

export function HeaderMenuProvider({ children }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const toggleMobileMenu = useCallback(() => setIsMobileMenuOpen((current) => !current), []);
  const closeMobileMenu = useCallback(() => setIsMobileMenuOpen(false), []);

  return (
    <HeaderMenuContext.Provider value={{ isMobileMenuOpen, toggleMobileMenu, closeMobileMenu }}>
      {children}
    </HeaderMenuContext.Provider>
  );
}

/**
 * useHeaderMenu
 * Throws a clear error instead of silently returning undefined if a
 * component ever calls this outside HeaderMenuProvider.
 */
export function useHeaderMenu() {
  const context = useContext(HeaderMenuContext);
  if (!context) {
    throw new Error("useHeaderMenu() must be called inside <HeaderMenuProvider>.");
  }
  return context;
}
