"use client";

import Link from "next/link";
import { Database, Shield, Zap, BarChart3, Clock, Users } from "lucide-react";

export default function HomePage() {
  return (
    <main>
      {/* Hero */}
      <section className="mx-auto max-w-5xl px-6 pt-20 pb-16">
        <div className="max-w-2xl">
          <p className="text-[13px] font-medium text-primary mb-4">
            Para utilizadores de Primavera ERP
          </p>
          <h1 className="text-4xl font-bold tracking-tight text-foreground leading-tight">
            Pergunte em português.
            <br />
            <span className="text-muted">Receba relatórios instantâneos.</span>
          </h1>
          <p className="mt-5 text-base text-muted leading-relaxed max-w-lg">
            Conecte a sua base de dados Primavera e faça perguntas em linguagem natural.
            A IA gera as queries SQL, executa-as em segurança e devolve gráficos e tabelas em segundos.
          </p>
          <div className="mt-8 flex items-center gap-3">
            <Link
              href="/signup"
              className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-hover transition-colors"
            >
              Começar grátis
            </Link>
            <Link
              href="/pricing"
              className="rounded-md border border-card-border px-5 py-2.5 text-sm font-medium text-foreground hover:bg-card transition-colors"
            >
              Ver preços
            </Link>
          </div>
          <p className="mt-4 text-[12px] text-muted/60">
            14 dias grátis. Sem cartão de crédito.
          </p>
        </div>
      </section>

      {/* Demo query */}
      <section className="mx-auto max-w-5xl px-6 pb-20">
        <div className="rounded-lg border border-card-border bg-card overflow-hidden">
          {/* Fake browser chrome */}
          <div className="flex items-center gap-2 border-b border-card-border px-4 py-2.5">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-[#333]" />
              <div className="w-2.5 h-2.5 rounded-full bg-[#333]" />
              <div className="w-2.5 h-2.5 rounded-full bg-[#333]" />
            </div>
            <div className="flex-1 text-center text-[11px] text-muted/40 font-mono">
              apura.xyz/query
            </div>
          </div>
          {/* Query demo */}
          <div className="p-5">
            <div className="rounded-md border border-card-border bg-background px-4 py-3 text-sm text-foreground/80">
              Top 10 clientes por faturação em 2025
            </div>
            <div className="mt-4 flex items-center gap-3 text-[12px] text-muted">
              <span className="flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-success" />
                25 resultados
              </span>
              <span>·</span>
              <span>230ms</span>
              <span>·</span>
              <span className="font-mono">Sonnet 4.6</span>
            </div>
            {/* Fake result table */}
            <div className="mt-4 rounded-md border border-card-border overflow-hidden">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-card-border bg-background">
                    <th className="px-4 py-2 text-left font-medium text-muted">#</th>
                    <th className="px-4 py-2 text-left font-medium text-muted">Cliente</th>
                    <th className="px-4 py-2 text-right font-medium text-muted">Faturação</th>
                    <th className="px-4 py-2 text-right font-medium text-muted">Nº Docs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-card-border">
                  {[
                    { n: 1, name: "Construções Atlântico Lda", val: "1.245.000", docs: 342 },
                    { n: 2, name: "TechPort Solutions SA", val: "987.500", docs: 198 },
                    { n: 3, name: "Distribuição Global SARL", val: "756.200", docs: 267 },
                    { n: 4, name: "Metalúrgica do Norte Lda", val: "623.800", docs: 145 },
                    { n: 5, name: "Agro-Indústria Sul SA", val: "512.300", docs: 189 },
                  ].map((row) => (
                    <tr key={row.n} className="hover:bg-[#111]">
                      <td className="px-4 py-2 text-muted tabular-nums">{row.n}</td>
                      <td className="px-4 py-2 text-foreground">{row.name}</td>
                      <td className="px-4 py-2 text-right text-foreground font-mono tabular-nums">{row.val} €</td>
                      <td className="px-4 py-2 text-right text-muted tabular-nums">{row.docs}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-card-border py-20">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-xl font-semibold text-foreground mb-2">Como funciona</h2>
          <p className="text-sm text-muted mb-10">Três passos para começar a analisar os seus dados.</p>

          <div className="grid grid-cols-3 gap-6">
            <div className="rounded-lg border border-card-border p-5">
              <div className="text-[11px] uppercase tracking-wider text-primary font-medium mb-3">1. Instalar</div>
              <h3 className="text-sm font-medium text-foreground mb-1.5">Connector no servidor</h3>
              <p className="text-[13px] text-muted leading-relaxed">
                Instale o Apura Connector no servidor Windows onde o SQL Server corre.
                Um executável, sem dependências.
              </p>
            </div>
            <div className="rounded-lg border border-card-border p-5">
              <div className="text-[11px] uppercase tracking-wider text-primary font-medium mb-3">2. Conectar</div>
              <h3 className="text-sm font-medium text-foreground mb-1.5">Ligação segura automática</h3>
              <p className="text-[13px] text-muted leading-relaxed">
                O Connector estabelece um túnel encriptado para a cloud. Sem abrir portas,
                sem configurar firewalls.
              </p>
            </div>
            <div className="rounded-lg border border-card-border p-5">
              <div className="text-[11px] uppercase tracking-wider text-primary font-medium mb-3">3. Perguntar</div>
              <h3 className="text-sm font-medium text-foreground mb-1.5">Pergunte em português</h3>
              <p className="text-[13px] text-muted leading-relaxed">
                Escreva a pergunta no browser. A IA gera o SQL, executa na sua base de dados
                e devolve o resultado com gráficos.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-card-border py-20">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-xl font-semibold text-foreground mb-2">Feito para Primavera</h2>
          <p className="text-sm text-muted mb-10">A IA conhece todas as tabelas do Primavera. Vendas, compras, contabilidade, RH, stocks.</p>

          <div className="grid grid-cols-3 gap-4">
            {[
              { icon: Database, title: "Acesso só de leitura", desc: "A base de dados nunca é alterada. Apenas SELECT, validado por 3 camadas de segurança." },
              { icon: Shield, title: "Dados ficam locais", desc: "As credenciais SQL nunca saem do servidor. Os resultados transitam encriptados e não são armazenados." },
              { icon: Zap, title: "Respostas em segundos", desc: "A IA gera o SQL optimizado com NOLOCK e TOP. Sem esperar por relatórios manuais." },
              { icon: BarChart3, title: "Gráficos automáticos", desc: "O sistema detecta o melhor gráfico para cada resultado. Barras, linhas, tabelas." },
              { icon: Clock, title: "Relatórios agendados", desc: "Programe relatórios recorrentes. Receba por email em PDF ou CSV todas as semanas." },
              { icon: Users, title: "Equipa com permissões", desc: "Convide analistas com acesso limitado. Controle quem pode executar queries e ver relatórios." },
            ].map((feature) => (
              <div key={feature.title} className="flex gap-3 p-4 rounded-lg border border-card-border">
                <feature.icon className="h-4 w-4 text-muted shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-[13px] font-medium text-foreground mb-1">{feature.title}</h3>
                  <p className="text-[12px] text-muted leading-relaxed">{feature.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-card-border py-20">
        <div className="mx-auto max-w-5xl px-6 text-center">
          <h2 className="text-xl font-semibold text-foreground mb-2">
            Comece a analisar os seus dados hoje
          </h2>
          <p className="text-sm text-muted mb-6">
            14 dias grátis. Sem cartão de crédito. Configuração em 5 minutos.
          </p>
          <Link
            href="/signup"
            className="inline-block rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-primary-hover transition-colors"
          >
            Criar conta grátis
          </Link>
        </div>
      </section>
    </main>
  );
}
