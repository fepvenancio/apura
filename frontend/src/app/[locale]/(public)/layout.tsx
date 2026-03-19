"use client";

import type { ReactNode } from "react";
import Link from "next/link";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-card-border">
        <div className="mx-auto max-w-5xl flex items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-semibold tracking-tight text-foreground">
            apura<span className="text-primary">.</span>
          </Link>
          <nav className="flex items-center gap-6">
            <Link href="/pricing" className="text-[13px] text-muted hover:text-foreground transition-colors">
              Preços
            </Link>
            <Link href="/login" className="text-[13px] text-muted hover:text-foreground transition-colors">
              Entrar
            </Link>
            <Link
              href="/signup"
              className="rounded-md bg-primary px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-primary-hover transition-colors"
            >
              Começar grátis
            </Link>
          </nav>
        </div>
      </header>

      {children}

      {/* Footer */}
      <footer className="border-t border-card-border mt-24">
        <div className="mx-auto max-w-5xl px-6 py-10">
          <div className="grid grid-cols-4 gap-8">
            <div>
              <div className="text-sm font-semibold tracking-tight text-foreground mb-3">
                apura<span className="text-primary">.</span>
              </div>
              <p className="text-[12px] text-muted leading-relaxed">
                Relatórios inteligentes para Primavera ERP.
                Pergunte em português, receba dados instantâneos.
              </p>
            </div>
            <div>
              <h4 className="text-[11px] uppercase tracking-wider text-muted mb-3">Produto</h4>
              <ul className="space-y-2">
                <li><Link href="/pricing" className="text-[13px] text-muted hover:text-foreground transition-colors">Preços</Link></li>
                <li><Link href="/signup" className="text-[13px] text-muted hover:text-foreground transition-colors">Criar conta</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-[11px] uppercase tracking-wider text-muted mb-3">Recursos</h4>
              <ul className="space-y-2">
                <li><Link href="/docs" className="text-[13px] text-muted hover:text-foreground transition-colors">Documentação</Link></li>
                <li><Link href="/docs" className="text-[13px] text-muted hover:text-foreground transition-colors">Guia de instalação</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-[11px] uppercase tracking-wider text-muted mb-3">Legal</h4>
              <ul className="space-y-2">
                <li><Link href="/privacy" className="text-[13px] text-muted hover:text-foreground transition-colors">Privacidade</Link></li>
                <li><Link href="/terms" className="text-[13px] text-muted hover:text-foreground transition-colors">Termos</Link></li>
              </ul>
            </div>
          </div>
          <div className="mt-10 pt-6 border-t border-card-border flex items-center justify-between">
            <p className="text-[12px] text-muted/50">© 2026 Apura. Todos os direitos reservados.</p>
            <p className="text-[12px] text-muted/50">Porto, Portugal</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
