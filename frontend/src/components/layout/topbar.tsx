"use client";

import { useState, useRef, useEffect } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useRouter } from "next/navigation";
import { LogOut, Settings, User } from "lucide-react";

interface TopbarProps {
  title: string;
  queriesUsed?: number;
  queriesLimit?: number;
}

export function Topbar({ title, queriesUsed, queriesLimit }: TopbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const router = useRouter();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  const usagePercent =
    queriesUsed !== undefined && queriesLimit
      ? Math.min((queriesUsed / queriesLimit) * 100, 100)
      : null;

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-card-border bg-card/80 backdrop-blur-sm px-6">
      <h1 className="text-lg font-semibold text-foreground">{title}</h1>

      <div className="flex items-center gap-4">
        {/* Usage indicator */}
        {usagePercent !== null && (
          <div className="hidden sm:flex items-center gap-2">
            <div className="w-24 h-1.5 rounded-full bg-[#1a1a1a] overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${usagePercent}%` }}
              />
            </div>
            <span className="text-xs text-muted">
              {queriesUsed}/{queriesLimit}
            </span>
          </div>
        )}

        {/* User menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted hover:bg-[#1a1a1a] hover:text-foreground transition-colors cursor-pointer"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-semibold">
              {user?.name?.charAt(0).toUpperCase() || "U"}
            </div>
            <span className="hidden sm:inline">{user?.name || "Utilizador"}</span>
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-card-border bg-card shadow-lg shadow-black/30 py-1">
              <button
                onClick={() => {
                  setMenuOpen(false);
                  router.push("/settings/profile");
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-muted hover:bg-[#1a1a1a] hover:text-foreground transition-colors cursor-pointer"
              >
                <User className="h-4 w-4" />
                Perfil
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  router.push("/settings/connector");
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-muted hover:bg-[#1a1a1a] hover:text-foreground transition-colors cursor-pointer"
              >
                <Settings className="h-4 w-4" />
                Definições
              </button>
              <div className="my-1 border-t border-card-border" />
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-danger hover:bg-danger/10 transition-colors cursor-pointer"
              >
                <LogOut className="h-4 w-4" />
                Sair
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
