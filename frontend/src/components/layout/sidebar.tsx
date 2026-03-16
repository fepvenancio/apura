"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/query", label: "Consultas", icon: Search },
  { href: "/history", label: "Hist\u00f3rico", icon: History },
  { href: "/reports", label: "Relat\u00f3rios", icon: FileBarChart },
  { href: "/dashboards", label: "Dashboards", icon: BarChart3 },
  { href: "/schema", label: "Esquema", icon: Database },
  { href: "/schedules", label: "Agendamentos", icon: Clock },
];

const settingsItems = [
  { href: "/settings/team", label: "Equipa", icon: Users },
  { href: "/settings/connector", label: "Conector", icon: Plug },
  { href: "/settings/billing", label: "Fatura\u00e7\u00e3o", icon: CreditCard },
  { href: "/settings/profile", label: "Perfil", icon: User },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
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
            <Link href="/" className="text-lg font-bold text-primary">
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
            {navItems.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted hover:bg-[#1a1a1a] hover:text-foreground"
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              );
            })}
          </div>

          {/* Settings section */}
          <div className="mt-6">
            {!collapsed && (
              <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted">
                Defini\u00e7\u00f5es
              </p>
            )}
            <div className="space-y-0.5">
              {settingsItems.map((item) => {
                const isActive = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted hover:bg-[#1a1a1a] hover:text-foreground"
                    )}
                    title={collapsed ? item.label : undefined}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {!collapsed && <span>{item.label}</span>}
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
                  ? "Conector ligado"
                  : connectorStatus === "checking"
                  ? "A verificar..."
                  : "Conector desligado"}
              </span>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
