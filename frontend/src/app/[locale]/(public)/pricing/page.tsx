"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { api } from "@/lib/api";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";

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
    supportKey: "Email",
    audit: "30d",
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
    supportKey: "Email (24h)",
    audit: "90d",
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
    reports: null,
    dashboards: null,
    schedules: "25",
    ai: "Sonnet",
    overage: "0,06",
    supportKey: "Priority (4h)",
    audit: "1y",
    popular: false,
    monthlyPriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_MONTHLY,
    annualPriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_ANNUAL,
  },
  {
    name: "Enterprise",
    monthly: 399,
    annual: 319,
    queries: "20.000",
    users: null,
    connectors: "10",
    reports: null,
    dashboards: null,
    schedules: null,
    ai: "Sonnet + Priority",
    overage: "0,04",
    supportKey: "Dedicated + Onboarding",
    audit: "2y",
    popular: false,
    monthlyPriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ENTERPRISE_MONTHLY,
    annualPriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ENTERPRISE_ANNUAL,
  },
];

export default function PricingPage() {
  const t = useTranslations("pricing");
  const locale = useLocale();
  const [annual, setAnnual] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const { isSignedIn } = useAuth();

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
          {t("title")}
        </h1>
        <p className="text-sm text-muted mt-2">
          {t("subtitle")}
        </p>

        {/* Toggle */}
        <div className="mt-6 inline-flex items-center gap-3 rounded-md border border-card-border p-1">
          <button
            onClick={() => setAnnual(false)}
            className={`rounded px-3 py-1.5 text-[13px] font-medium transition-colors cursor-pointer ${
              !annual ? "bg-card text-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            {t("monthly")}
          </button>
          <button
            onClick={() => setAnnual(true)}
            className={`rounded px-3 py-1.5 text-[13px] font-medium transition-colors cursor-pointer ${
              annual ? "bg-card text-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            {t("annual")}
            <span className="ml-1.5 text-[11px] text-primary">{t("annualDiscount")}</span>
          </button>
        </div>
      </div>

      {/* Plans grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {plans.map((plan) => {
          const priceId = getPriceId(plan);
          const loggedIn = !!isSignedIn;
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
                  {t("mostPopular")}
                </span>
              )}
              <h3 className="text-sm font-semibold text-foreground">{plan.name}</h3>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-3xl font-bold tabular-nums text-foreground">
                  &euro;{annual ? plan.annual : plan.monthly}
                </span>
                <span className="text-[13px] text-muted">{t("perMonth")}</span>
              </div>
              {annual && (
                <p className="text-[11px] text-muted mt-1">
                  {t("billedAnnually", { amount: `\u20AC${plan.annual * 12}` })}
                </p>
              )}

              <p className="text-[11px] text-primary/80 mt-2">
                {t("trialText")}
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
                  {isLoading ? t("redirecting") : t("upgrade")}
                </button>
              ) : loggedIn && !isEnterprise && !priceId ? (
                <button
                  disabled
                  className="mt-5 block rounded-md px-4 py-2 text-center text-[13px] font-medium bg-card border border-card-border text-muted opacity-50 cursor-not-allowed"
                >
                  {t("unavailable")}
                </button>
              ) : isEnterprise ? (
                <Link
                  href="mailto:comercial@apura.pt"
                  className={`mt-5 block rounded-md px-4 py-2 text-center text-[13px] font-medium transition-colors bg-card border border-card-border text-foreground hover:bg-[#1a1a1a]`}
                >
                  {t("contact")}
                </Link>
              ) : (
                <Link
                  href={`/${locale}/signup`}
                  className={`mt-5 block rounded-md px-4 py-2 text-center text-[13px] font-medium transition-colors ${
                    plan.popular
                      ? "bg-primary text-white hover:bg-primary-hover"
                      : "bg-card border border-card-border text-foreground hover:bg-[#1a1a1a]"
                  }`}
                >
                  {t("startFree")}
                </Link>
              )}

              <div className="mt-5 pt-5 border-t border-card-border space-y-2.5 flex-1">
                <Row label={t("queriesPerMonth")} value={plan.queries} />
                <Row label={t("users")} value={plan.users} unlimitedLabel={t("unlimited")} />
                <Row label={t("databases")} value={plan.connectors} />
                <Row label={t("savedReports")} value={plan.reports} unlimitedLabel={t("unlimited")} />
                <Row label={t("dashboardsLabel")} value={plan.dashboards} unlimitedLabel={t("unlimited")} />
                <Row label={t("scheduledReports")} value={plan.schedules} unlimitedLabel={t("unlimited")} />
                <Row label={t("aiModel")} value={plan.ai} />
                <Row label={t("overage")} value={`\u20AC${plan.overage}`} />
                <Row label={t("support")} value={plan.supportKey} />
                <Row label={t("auditLog")} value={plan.audit} />
              </div>
            </div>
          );
        })}
      </div>

      {/* FAQ */}
      <section className="mt-20">
        <h2 className="text-lg font-semibold text-foreground mb-6">{t("faqTitle")}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Faq q={t("faqQueryTitle")} a={t("faqQueryAnswer")} />
          <Faq q={t("faqChangePlanTitle")} a={t("faqChangePlanAnswer")} />
          <Faq q={t("faqSecurityTitle")} a={t("faqSecurityAnswer")} />
          <Faq q={t("faqInstallTitle")} a={t("faqInstallAnswer")} />
          <Faq q={t("faqVersionTitle")} a={t("faqVersionAnswer")} />
          <Faq q={t("faqOverageTitle")} a={t("faqOverageAnswer")} />
        </div>
      </section>
    </main>
  );
}

function Row({ label, value, unlimitedLabel }: { label: string; value: string | null; unlimitedLabel?: string }) {
  return (
    <div className="flex items-center justify-between text-[12px]">
      <span className="text-muted">{label}</span>
      {value ? (
        <span className="text-foreground font-medium">{value}</span>
      ) : unlimitedLabel ? (
        <span className="text-foreground font-medium">{unlimitedLabel}</span>
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
