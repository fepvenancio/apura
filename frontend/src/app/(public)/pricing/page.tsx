"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { useState } from "react";

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
    support: "Prioritário (4h)",
    audit: "1 ano",
    popular: false,
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
    ai: "Sonnet + Prioritário",
    overage: "0,04",
    support: "Dedicado + Onboarding",
    audit: "2 anos",
    popular: false,
  },
];

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);

  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <div className="text-center mb-12">
        <h1 className="text-2xl font-bold text-foreground">
          Planos simples e transparentes
        </h1>
        <p className="text-sm text-muted mt-2">
          Comece com 14 dias grátis. Sem cartão de crédito.
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
      <div className="grid grid-cols-4 gap-4">
        {plans.map((plan) => (
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
                €{annual ? plan.annual : plan.monthly}
              </span>
              <span className="text-[13px] text-muted">/mês</span>
            </div>
            {annual && (
              <p className="text-[11px] text-muted mt-1">
                Facturado anualmente (€{plan.annual * 12}/ano)
              </p>
            )}

            <Link
              href="/signup"
              className={`mt-5 block rounded-md px-4 py-2 text-center text-[13px] font-medium transition-colors ${
                plan.popular
                  ? "bg-primary text-white hover:bg-primary-hover"
                  : "bg-card border border-card-border text-foreground hover:bg-[#1a1a1a]"
              }`}
            >
              {plan.name === "Enterprise" ? "Contactar" : "Começar grátis"}
            </Link>

            <div className="mt-5 pt-5 border-t border-card-border space-y-2.5 flex-1">
              <Row label="Consultas/mês" value={plan.queries} />
              <Row label="Utilizadores" value={plan.users} />
              <Row label="Bases de dados" value={plan.connectors} />
              <Row label="Relatórios guardados" value={plan.reports} />
              <Row label="Dashboards" value={plan.dashboards} />
              <Row label="Relatórios agendados" value={plan.schedules} />
              <Row label="Modelo IA" value={plan.ai} />
              <Row label="Excedente/consulta" value={`€${plan.overage}`} />
              <Row label="Suporte" value={plan.support} />
              <Row label="Registo de auditoria" value={plan.audit} />
            </div>
          </div>
        ))}
      </div>

      {/* FAQ */}
      <section className="mt-20">
        <h2 className="text-lg font-semibold text-foreground mb-6">Perguntas frequentes</h2>
        <div className="grid grid-cols-2 gap-6">
          <Faq
            q="O que conta como uma consulta?"
            a="Cada pergunta em linguagem natural que gera e executa uma query SQL conta como uma consulta. Visualizar resultados guardados ou exportar não conta."
          />
          <Faq
            q="Posso mudar de plano a qualquer momento?"
            a="Sim. Pode fazer upgrade ou downgrade a qualquer momento. As alterações são aplicadas imediatamente e o valor é ajustado pro-rata."
          />
          <Faq
            q="Os meus dados ficam seguros?"
            a="As credenciais SQL nunca saem do seu servidor. Os resultados transitam encriptados e não são armazenados na cloud. Apenas SELECT é permitido."
          />
          <Faq
            q="Preciso de instalar algo?"
            a="Sim, o Apura Connector — um executável leve que corre como serviço Windows no servidor onde o SQL Server está instalado. Sem dependências externas."
          />
          <Faq
            q="Funciona com todas as versões do Primavera?"
            a="Suportamos Primavera V9, V10 e Evolution. A estrutura da base de dados é standard entre versões."
          />
          <Faq
            q="E se ultrapassar o limite de consultas?"
            a="As consultas adicionais são cobradas ao preço de excedente do seu plano. Sem surpresas — pode ver o consumo em tempo real no dashboard."
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
        <span className="text-muted/30">—</span>
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
