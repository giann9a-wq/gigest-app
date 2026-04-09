"use client";

import { useEffect, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href?: Route;
  label: string;
  disabled?: boolean;
  title?: string;
};

type AppHeaderProps = {
  userLabel?: string | null;
  showAdminLink: boolean;
  logoutAction: React.ReactNode;
};

export function AppHeader({ userLabel, showAdminLink, logoutAction }: AppHeaderProps) {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    document.body.classList.toggle("app-mobile-menu-open", isMenuOpen);

    return () => {
      document.body.classList.remove("app-mobile-menu-open");
    };
  }, [isMenuOpen]);

  const navItems: NavItem[] = [
    { href: "/dashboard" as Route, label: "Dashboard" },
    { href: "/diario" as Route, label: "Diario di cantiere" },
    { href: "/commesse" as Route, label: "Gestione Commesse" },
    { href: "/scadenziario" as Route, label: "Scadenziario" },
    { href: "/stampa-risorse-mese" as Route, label: "Stampa Risorse" },
    ...(showAdminLink ? [{ href: "/admin/accessi" as Route, label: "Admin" }] : []),
  ];

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <div className="app-header-top">
          <Link href="/dashboard" className="app-brand">
            <span className="app-brand-mark">Gi</span>
            <span className="app-brand-text">GEST</span>
          </Link>

          <button
            type="button"
            className="app-mobile-menu-button"
            onClick={() => setIsMenuOpen((current) => !current)}
            aria-expanded={isMenuOpen}
            aria-controls="app-mobile-drawer"
            aria-label={isMenuOpen ? "Chiudi menu" : "Apri menu"}
          >
            <span className="app-mobile-menu-icon" aria-hidden="true">
              {isMenuOpen ? "×" : "☰"}
            </span>
            <span className="app-mobile-menu-label">{isMenuOpen ? "Chiudi" : "Menu"}</span>
          </button>
        </div>

        <div className="app-header-desktop">
          <nav className="app-nav" aria-label="Navigazione principale">
            {navItems.map((item) =>
              item.href ? (
                <Link key={item.href} href={item.href} className="app-nav-link">
                  {item.label}
                </Link>
              ) : (
                <span
                  key={item.label}
                  className="app-nav-link app-nav-link-disabled"
                  aria-disabled="true"
                  title={item.title}
                >
                  {item.label}
                </span>
              )
            )}
          </nav>

          {userLabel ? (
            <div className="app-user-actions">
              <span className="app-user-chip">{userLabel}</span>
              {logoutAction}
            </div>
          ) : null}
        </div>
      </div>

      <div className={`app-mobile-drawer-shell ${isMenuOpen ? "app-mobile-drawer-shell-open" : ""}`}>
        <button
          type="button"
          className="app-mobile-drawer-backdrop"
          onClick={() => setIsMenuOpen(false)}
          aria-label="Chiudi menu"
          tabIndex={isMenuOpen ? 0 : -1}
        />
        <div
          id="app-mobile-drawer"
          className={`app-mobile-drawer ${isMenuOpen ? "app-mobile-drawer-open" : ""}`}
        >
          <div className="app-mobile-drawer-header">
            <strong>Menu</strong>
            <button
              type="button"
              className="app-mobile-drawer-close"
              onClick={() => setIsMenuOpen(false)}
              aria-label="Chiudi menu"
            >
              ×
            </button>
          </div>

          <nav className="app-mobile-nav" aria-label="Navigazione mobile">
            {navItems.map((item) =>
              item.href ? (
                <Link key={item.href} href={item.href} className="app-mobile-nav-link">
                  {item.label}
                </Link>
              ) : (
                <span
                  key={item.label}
                  className="app-mobile-nav-link app-mobile-nav-link-disabled"
                  aria-disabled="true"
                  title={item.title}
                >
                  {item.label}
                </span>
              )
            )}
          </nav>

          {userLabel ? (
            <div className="app-mobile-drawer-footer">
              <span className="app-user-chip">{userLabel}</span>
              {logoutAction}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
