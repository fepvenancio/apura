"use client";

import { UserButton } from "@clerk/nextjs";

interface TopbarProps {
  title: string;
  queriesUsed?: number;
  queriesLimit?: number;
}

export function Topbar({ title, queriesUsed, queriesLimit }: TopbarProps) {

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

        <UserButton
          appearance={{
            elements: {
              avatarBox: "h-7 w-7",
            },
          }}
        />
      </div>
    </header>
  );
}
