"use client";

import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-sm">{children}</div>
      </div>
      <footer className="py-6 text-center">
        <p className="text-[12px] text-muted/60">
          apura.xyz &mdash; Relat&oacute;rios inteligentes para Primavera
        </p>
      </footer>
    </div>
  );
}
