"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LogoFull, LogoMark } from "@/components/StrandLogo";
import { ShowSelect } from "@/components/ShowSelect";
import { useShow } from "@/components/ShowProvider";
import { StrandIcon } from "@/components/StrandIcon";

const STORAGE_KEY = "superfan-sidebar-collapsed";
const WIDTH_EXPANDED = "240px";
const WIDTH_COLLAPSED = "56px";

const NAV = [
  { href: "/", label: "Shorts", icon: "play-boxed" },
  { href: "/explore", label: "Explore", icon: "search" },
  { href: "/spotlight", label: "Spotlight", icon: "analyze" },
] as const;

function navActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function setSidebarWidth(collapsed: boolean) {
  document.documentElement.style.setProperty(
    "--sidebar-width",
    collapsed ? WIDTH_COLLAPSED : WIDTH_EXPANDED,
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { showId, setShowId, shows, ready: showReady } = useShow();
  const [collapsed, setCollapsed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const isCollapsed = stored === "true";
    setCollapsed(isCollapsed);
    setSidebarWidth(isCollapsed);
    setReady(true);
  }, []);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      setSidebarWidth(next);
      return next;
    });
  };

  const widthClass = ready ? (collapsed ? "w-14" : "w-sidebar") : "w-sidebar";

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-30 flex h-dvh flex-col border-r border-border bg-surface transition-[width] duration-200 ease-out ${widthClass}`}
      aria-label="Main navigation"
    >
      <div
        className={`flex shrink-0 items-center border-b border-border-light ${
          collapsed ? "justify-center px-2 py-4" : "px-5 py-5"
        }`}
      >
        <Link
          href="/"
          className="flex items-center text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          title="TwelveLabs"
        >
          {collapsed ? (
            <LogoMark className="h-7 w-7" />
          ) : (
            <LogoFull className="h-6 max-w-[140px]" />
          )}
        </Link>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
        {NAV.map(({ href, label, icon }) => {
          const active = navActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={`flex items-center rounded-md text-sm font-system transition-colors ${
                collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2"
              } ${
                active
                  ? "bg-brand-charcoal text-text-inverse"
                  : "text-text-primary hover:bg-card"
              }`}
            >
              <StrandIcon name={icon} className="h-4 w-4" label={collapsed ? label : undefined} />
              {!collapsed && <span>{label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto shrink-0 space-y-1 border-t border-border-light p-2">
        {!collapsed && (
          <p className="px-3 pb-0.5 text-[10px] font-medium uppercase tracking-wider text-text-tertiary">
            Demo app
          </p>
        )}
        {showReady && shows.length > 0 && (
          <ShowSelect
            shows={shows}
            value={showId}
            onChange={setShowId}
            collapsed={collapsed}
          />
        )}
        <button
          type="button"
          onClick={toggle}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          className={`flex w-full items-center rounded-md text-text-secondary transition-colors hover:bg-card hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
            collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2"
          }`}
        >
          <StrandIcon
            name="collapse"
            className={`h-4 w-4 transition-transform ${collapsed ? "rotate-180" : ""}`}
            label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          />
          {!collapsed && <span className="text-sm font-system">Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
