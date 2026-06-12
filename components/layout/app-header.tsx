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
  news: {
    enabled: boolean;
    title: string;
    description: string;
  };
};

export function AppHeader({ userLabel, showAdminLink, logoutAction, news }: AppHeaderProps) {
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
    { href: "/dashboard-commessa" as Route, label: "Gestione Commesse" },
    { href: "/risorse" as Route, label: "Gestione Risorse" },
    { href: "/documentale" as Route, label: "Documentale" },
    { href: "/scadenziario" as Route, label: "Scadenziario" },
    { href: "/stampa-risorse-mese" as Route, label: "Stampa Risorse" },
    ...(showAdminLink ? [{ href: "/admin" as Route, label: "Admin" }] : []),
  ];

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <div className="app-header-top">
          <Link href="/dashboard" className="app-brand">
            <span className="app-brand-mark">Gi</span>
            <span className="app-brand-text">GEST</span>
          </Link>

          {userLabel ? (
            <div className="app-user-actions app-user-actions-desktop">
              <span className="app-user-chip">{userLabel}</span>
              {logoutAction}
            </div>
          ) : null}

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
        </div>

        {news.enabled ? (
          <section className="app-header-news-banner" aria-label="News">
            <span>{news.title}</span>
            <p>{news.description}</p>
          </section>
        ) : null}
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
