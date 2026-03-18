"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";

const plans = [
  {
    name: "Starter",
    monthly: 29,
    annual: 23,
    queries: "200",
    users: "3",
    connectors: "1",
    reports: "10",
    dashboards: "1",
    schedules: null,
    ai: "Haiku",
    overage: "0,15",
    support: "Email",
    audit: "30 dias",
    popular: false,
    monthlyPriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER_MONTHLY,
    annualPriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER_ANNUAL,
  },
  {
    name: "Professional",
    monthly: 79,
    annual: 63,
    queries: "1.000",
    users: "10",
    connectors: "1",
    reports: "50",
    dashboards: "5",
    schedules: "5",
    ai: "Haiku + Sonnet",
    overage: "0,10",
    support: "Email (24h)",
    audit: "90 dias",
    popular: true,
    monthlyPriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PROFESSIONAL_MONTHLY,
    annualPriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PROFESSIONAL_ANNUAL,
  },
  {
    name: "Business",
    monthly: 199,
    annual: 159,
    queries: "5.000",
    users: "25",
    connectors: "3",
    reports: "Ilimitados",
    dashboards: "Ilimitados",
    schedules: "25",
    ai: "Sonnet",
    overage: "0,06",
    support: "Prioritario (4h)",
    audit: "1 ano",
    popular: false,
    monthlyPriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_MONTHLY,
    annualPriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_ANNUAL,
  },
  {
    name: "Enterprise",
    monthly: 399,
    annual: 319,
    queries: "20.000",
    users: "Ilimitados",
    connectors: "10",
    reports: "Ilimitados",
    dashboards: "Ilimitados",
    schedules: "Ilimitados",
    ai: "Sonnet + Prioritario",
    overage: "0,04",
    support: "Dedicado + Onboarding",
    audit: "2 anos",
    popular: false,
    monthlyPriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ENTERPRISE_MONTHLY,
    annualPriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ENTERPRISE_ANNUAL,
  },
];

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  function isLoggedIn() {
    if (typeof window === "undefined") return false;
    return !!localStorage.getItem("accessToken");
  }

  async function handleCheckout(priceId: string, planName: string) {
    setLoadingPlan(planName);
    try {
      const { url } = await api.createCheckout(priceId);
      window.location.href = url;
    } catch {
      setLoadingPlan(null);
    }
  }

  function getPriceId(plan: (typeof plans)[number]) {
    return annual ? plan.annualPriceId : plan.monthlyPriceId;
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <div className="text-center mb-12">
        <h1 className="text-2xl font-bold text-foreground">
          Planos simples e transparentes
        </h1>
        <p className="text-sm text-muted mt-2">
          Comece com 14 dias gratis. Sem cartao de credito.
        </p>

        {/* Toggle */}
        <div className="mt-6 inline-flex items-center gap-3 rounded-md border border-card-border p-1">
          <button
            onClick={() => setAnnual(false)}
            className={`rounded px-3 py-1.5 text-[13px] font-medium transition-colors cursor-pointer ${
              !annual ? "bg-card text-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            Mensal
          </button>
          <button
            onClick={() => setAnnual(true)}
            className={`rounded px-3 py-1.5 text-[13px] font-medium transition-colors cursor-pointer ${
              annual ? "bg-card text-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            Anual
            <span className="ml-1.5 text-[11px] text-primary">-20%</span>
          </button>
        </div>
      </div>

      {/* Plans grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {plans.map((plan) => {
          const priceId = getPriceId(plan);
          const loggedIn = isLoggedIn();
          const isEnterprise = plan.name === "Enterprise";
          const canCheckout = loggedIn && !isEnterprise && !!priceId;
          const isLoading = loadingPlan === plan.name;

          return (
            <div
              key={plan.name}
              className={`rounded-lg border p-5 flex flex-col ${
                plan.popular
                  ? "border-primary/50 bg-primary/[0.03]"
                  : "border-card-border bg-card"
              }`}
            >
              {plan.popular && (
                <span className="text-[10px] uppercase tracking-wider font-medium text-primary mb-2">
                  Mais popular
                </span>
              )}
              <h3 className="text-sm font-semibold text-foreground">{plan.name}</h3>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-3xl font-bold tabular-nums text-foreground">
                  &euro;{annual ? plan.annual : plan.monthly}
                </span>
                <span className="text-[13px] text-muted">/mes</span>
              </div>
              {annual && (
                <p className="text-[11px] text-muted mt-1">
                  Facturado anualmente (&euro;{plan.annual * 12}/ano)
                </p>
              )}

              <p className="text-[11px] text-primary/80 mt-2">
                14 dias gratis
              </p>

              {canCheckout ? (
                <button
                  onClick={() => handleCheckout(priceId!, plan.name)}
                  disabled={isLoading}
                  className={`mt-5 block rounded-md px-4 py-2 text-center text-[13px] font-medium transition-colors cursor-pointer disabled:opacity-50 ${
                    plan.popular
                      ? "bg-primary text-white hover:bg-primary-hover"
                      : "bg-card border border-card-border text-foreground hover:bg-[#1a1a1a]"
                  }`}
                >
                  {isLoading ? "A redirecionar..." : "Fazer upgrade"}
                </button>
              ) : loggedIn && !isEnterprise && !priceId ? (
                <button
                  disabled
                  className="mt-5 block rounded-md px-4 py-2 text-center text-[13px] font-medium bg-card border border-card-border text-muted opacity-50 cursor-not-allowed"
                >
                  Indisponivel
                </button>
              ) : isEnterprise ? (
                <Link
                  href="mailto:comercial@apura.pt"
                  className={`mt-5 block rounded-md px-4 py-2 text-center text-[13px] font-medium transition-colors bg-card border border-card-border text-foreground hover:bg-[#1a1a1a]`}
                >
                  Contactar
                </Link>
              ) : (
                <Link
                  href="/signup"
                  className={`mt-5 block rounded-md px-4 py-2 text-center text-[13px] font-medium transition-colors ${
                    plan.popular
                      ? "bg-primary text-white hover:bg-primary-hover"
                      : "bg-card border border-card-border text-foreground hover:bg-[#1a1a1a]"
                  }`}
                >
                  Comecar gratis
                </Link>
              )}

              <div className="mt-5 pt-5 border-t border-card-border space-y-2.5 flex-1">
                <Row label="Consultas/mes" value={plan.queries} />
                <Row label="Utilizadores" value={plan.users} />
                <Row label="Bases de dados" value={plan.connectors} />
                <Row label="Relatorios guardados" value={plan.reports} />
                <Row label="Dashboards" value={plan.dashboards} />
                <Row label="Relatorios agendados" value={plan.schedules} />
                <Row label="Modelo IA" value={plan.ai} />
                <Row label="Excedente/consulta" value={`\u20AC${plan.overage}`} />
                <Row label="Suporte" value={plan.support} />
                <Row label="Registo de auditoria" value={plan.audit} />
              </div>
            </div>
          );
        })}
      </div>

      {/* FAQ */}
      <section className="mt-20">
        <h2 className="text-lg font-semibold text-foreground mb-6">Perguntas frequentes</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Faq
            q="O que conta como uma consulta?"
            a="Cada pergunta em linguagem natural que gera e executa uma query SQL conta como uma consulta. Visualizar resultados guardados ou exportar nao conta."
          />
          <Faq
            q="Posso mudar de plano a qualquer momento?"
            a="Sim. Pode fazer upgrade ou downgrade a qualquer momento. As alteracoes sao aplicadas imediatamente e o valor e ajustado pro-rata."
          />
          <Faq
            q="Os meus dados ficam seguros?"
            a="As credenciais SQL nunca saem do seu servidor. Os resultados transitam encriptados e nao sao armazenados na cloud. Apenas SELECT e permitido."
          />
          <Faq
            q="Preciso de instalar algo?"
            a="Sim, o Apura Connector -- um executavel leve que corre como servico Windows no servidor onde o SQL Server esta instalado. Sem dependencias externas."
          />
          <Faq
            q="Funciona com todas as versoes do Primavera?"
            a="Suportamos Primavera V9, V10 e Evolution. A estrutura da base de dados e standard entre versoes."
          />
          <Faq
            q="E se ultrapassar o limite de consultas?"
            a="As consultas adicionais sao cobradas ao preco de excedente do seu plano. Sem surpresas -- pode ver o consumo em tempo real no dashboard."
          />
        </div>
      </section>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-center justify-between text-[12px]">
      <span className="text-muted">{label}</span>
      {value ? (
        <span className="text-foreground font-medium">{value}</span>
      ) : (
        <span className="text-muted/30">&mdash;</span>
      )}
    </div>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <div className="rounded-lg border border-card-border p-4">
      <h3 className="text-[13px] font-medium text-foreground mb-1.5">{q}</h3>
      <p className="text-[12px] text-muted leading-relaxed">{a}</p>
    </div>
  );
}
