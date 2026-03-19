"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { cn } from "@/lib/utils";
import { useConnectorStore } from "@/stores/connector-store";
import {
  LayoutDashboard,
  Search,
  History,
  FileBarChart,
  BarChart3,
  Database,
  Clock,
  Users,
  Plug,
  CreditCard,
  User,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const navKeys = [
  { path: "/home", key: "dashboard", icon: LayoutDashboard },
  { path: "/query", key: "queries", icon: Search },
  { path: "/history", key: "history", icon: History },
  { path: "/reports", key: "reports", icon: FileBarChart },
  { path: "/dashboards", key: "dashboards", icon: BarChart3 },
  { path: "/schema", key: "schema", icon: Database },
  { path: "/schedules", key: "schedules", icon: Clock },
];

const settingsKeys = [
  { path: "/settings/team", key: "team", icon: Users },
  { path: "/settings/connector", key: "connector", icon: Plug },
  { path: "/settings/billing", key: "billing", icon: CreditCard },
  { path: "/settings/profile", key: "profile", icon: User },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const t = useTranslations("nav");
  const locale = useLocale();
  const connectorStatus = useConnectorStore((s) => s.status);

  return (
    <>
      {/* Mobile overlay */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-card-border bg-card transition-all duration-200",
          collapsed ? "w-16" : "w-60"
        )}
      >
        {/* Logo */}
        <div className="flex h-14 items-center justify-between border-b border-card-border px-4">
          {!collapsed && (
            <Link href={`/${locale}`} className="text-lg font-bold text-primary">
              Apura
            </Link>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="rounded-lg p-1.5 text-muted hover:bg-[#1a1a1a] hover:text-foreground transition-colors cursor-pointer"
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Main nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          <div className="space-y-0.5">
            {navKeys.map((item) => {
              const href = `/${locale}${item.path}`;
              const label = t(item.key);
              const isActive =
                pathname === href ||
                (item.path !== "/" && pathname.startsWith(href));
              return (
                <Link
                  key={item.path}
                  href={href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted hover:bg-[#1a1a1a] hover:text-foreground"
                  )}
                  title={collapsed ? label : undefined}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span>{label}</span>}
                </Link>
              );
            })}
          </div>

          {/* Settings section */}
          <div className="mt-6">
            {!collapsed && (
              <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted">
                {t("settings")}
              </p>
            )}
            <div className="space-y-0.5">
              {settingsKeys.map((item) => {
                const href = `/${locale}${item.path}`;
                const label = t(item.key);
                const isActive = pathname.startsWith(href);
                return (
                  <Link
                    key={item.path}
                    href={href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted hover:bg-[#1a1a1a] hover:text-foreground"
                    )}
                    title={collapsed ? label : undefined}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {!collapsed && <span>{label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        </nav>

        {/* Connector status */}
        <div className="border-t border-card-border px-4 py-3">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "h-2 w-2 rounded-full shrink-0",
                connectorStatus === "connected"
                  ? "bg-success"
                  : connectorStatus === "checking"
                  ? "bg-warning animate-pulse"
                  : "bg-danger"
              )}
            />
            {!collapsed && (
              <span className="text-xs text-muted">
                {connectorStatus === "connected"
                  ? t("connectorConnected")
                  : connectorStatus === "checking"
                  ? t("connectorChecking")
                  : t("connectorDisconnected")}
              </span>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
