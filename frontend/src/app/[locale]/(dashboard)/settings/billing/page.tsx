"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { BillingInfo } from "@/lib/types";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PaymentFailedBanner } from "@/components/billing/payment-failed-banner";
import { formatDate } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";

const PLANS = [
  {
    name: "Starter",
    planKey: "starter",
    monthly: 29,
    annual: 23,
    queries: "200",
    members: "3",
    monthlyPriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER_MONTHLY,
    annualPriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER_ANNUAL,
  },
  {
    name: "Professional",
    planKey: "professional",
    monthly: 79,
    annual: 63,
    queries: "1.000",
    members: "10",
    monthlyPriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PROFESSIONAL_MONTHLY,
    annualPriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PROFESSIONAL_ANNUAL,
  },
  {
    name: "Business",
    planKey: "business",
    monthly: 199,
    annual: 159,
    queries: "5.000",
    members: "25",
    monthlyPriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_MONTHLY,
    annualPriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_ANNUAL,
  },
  {
    name: "Enterprise",
    planKey: "enterprise",
    monthly: 399,
    annual: 319,
    queries: "20.000",
    members: "unlimited",
    monthlyPriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ENTERPRISE_MONTHLY,
    annualPriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ENTERPRISE_ANNUAL,
  },
];

export default function BillingPage() {
  const t = useTranslations("billing");
  const tc = useTranslations("common");
  const locale = useLocale();
  const fullLocale = locale === "pt" ? "pt-PT" : locale === "es" ? "es-ES" : "en-US";
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [annual, setAnnual] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  function getStatusBadge(status: string | null, currentPeriodEnd?: string) {
    switch (status) {
      case "active":
        return <Badge variant="success" dot>{t("statusActive")}</Badge>;
      case "trialing":
        return <Badge variant="primary" dot>{t("statusTrial")}</Badge>;
      case "past_due":
        return <Badge variant="danger" dot>{t("statusPastDue")}</Badge>;
      case "canceling":
        return (
          <Badge variant="warning" dot>
            {t("statusCanceling", { date: currentPeriodEnd ? formatDate(currentPeriodEnd, fullLocale) : "..." })}
          </Badge>
        );
      case "canceled":
        return <Badge variant="muted" dot>{t("statusCanceled")}</Badge>;
      default:
        return <Badge variant="muted">{status || t("statusUnknown")}</Badge>;
    }
  }

  useEffect(() => {
    api
      .getBilling()
      .then(setBilling)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleUpgrade(priceId: string, planName: string) {
    setLoadingPlan(planName);
    try {
      const { url } = await api.createCheckout(priceId);
      window.location.href = url;
    } catch {
      setLoadingPlan(null);
    }
  }

  async function handleManageBilling() {
    setPortalLoading(true);
    try {
      const { url } = await api.createPortalSession();
      window.location.href = url;
    } catch {
      setPortalLoading(false);
    }
  }

  const hasActiveSubscription =
    billing?.subscriptionStatus === "active" ||
    billing?.subscriptionStatus === "past_due" ||
    billing?.subscriptionStatus === "canceling";

  return (
    <div>
      <Topbar title={t("title")} />

      <div className="max-w-5xl p-6 space-y-6">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted">
            <p className="text-sm">{tc("loading")}</p>
          </div>
        ) : (
          <>
            {/* Payment failed banner */}
            {billing?.subscriptionStatus === "past_due" && (
              <PaymentFailedBanner />
            )}

            {/* Current plan */}
            {billing && (
              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="text-sm font-semibold">{t("currentPlan")}</h3>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(billing.subscriptionStatus, billing.currentPeriodEnd)}
                      <Badge variant="primary">{billing.plan}</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted">
                        {t("queries")}
                      </p>
                      <div className="flex items-baseline gap-1.5 mt-1">
                        <span className="text-xl font-semibold tabular-nums">
                          {billing.queriesUsed}
                        </span>
                        <span className="text-xs text-muted">
                          / {billing.queriesLimit}
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 w-full rounded-full bg-[#1a1a1a] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{
                            width: `${Math.min(
                              (billing.queriesUsed / billing.queriesLimit) * 100,
                              100
                            )}%`,
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted">
                        {t("members")}
                      </p>
                      <div className="flex items-baseline gap-1.5 mt-1">
                        <span className="text-xl font-semibold tabular-nums">
                          {billing.membersUsed}
                        </span>
                        <span className="text-xs text-muted">
                          / {billing.membersLimit}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 pt-2 text-xs text-muted sm:flex-row sm:items-center sm:gap-4">
                      <span>
                        {t("billingEmail", { email: billing.billingEmail })}
                      </span>
                      <span>
                        {t("periodEnd", { date: formatDate(billing.currentPeriodEnd, fullLocale) })}
                      </span>
                    </div>

                    {/* Canceling message */}
                    {billing.subscriptionStatus === "canceling" && (
                      <div className="rounded-md border border-amber-500/20 bg-amber-500/10 p-3">
                        <p className="text-sm text-amber-400">
                          {t("cancelingMessage", { date: formatDate(billing.currentPeriodEnd, fullLocale) })}
                        </p>
                      </div>
                    )}

                    {/* Manage billing button */}
                    {hasActiveSubscription && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleManageBilling}
                        isLoading={portalLoading}
                      >
                        {t("manageBilling")}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Plan comparison */}
            <div>
              <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-sm font-semibold">{t("availablePlans")}</h3>

                {/* Monthly/Annual toggle */}
                <div className="inline-flex items-center gap-3 rounded-md border border-card-border p-1">
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

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {PLANS.map((plan) => {
                  const isCurrent =
                    billing?.plan.toLowerCase() === plan.planKey;
                  const priceId = annual ? plan.annualPriceId : plan.monthlyPriceId;
                  const isEnterprise = plan.planKey === "enterprise";
                  const isLoading = loadingPlan === plan.name;

                  return (
                    <Card
                      key={plan.name}
                      className={isCurrent ? "border-primary" : ""}
                    >
                      <CardContent className="py-5">
                        <div className="mb-4">
                          <h4 className="font-semibold text-foreground">
                            {plan.name}
                          </h4>
                          <div className="mt-1 flex items-baseline gap-0.5">
                            <span className="text-2xl font-semibold text-foreground">
                              &euro;{annual ? plan.annual : plan.monthly}
                            </span>
                            <span className="text-xs text-muted">{t("perMonth")}</span>
                          </div>
                          {annual && (
                            <p className="text-[11px] text-muted mt-0.5">
                              &euro;{plan.annual * 12}{t("perYear")}
                            </p>
                          )}
                        </div>

                        <ul className="space-y-2 mb-4">
                          <li className="text-xs text-muted flex items-start gap-2">
                            <span className="text-primary mt-0.5">&#10003;</span>
                            {t("queriesPerMonth", { count: plan.queries })}
                          </li>
                          <li className="text-xs text-muted flex items-start gap-2">
                            <span className="text-primary mt-0.5">&#10003;</span>
                            {t("usersCount", { count: plan.members })}
                          </li>
                        </ul>

                        {isCurrent ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            className="w-full"
                            disabled
                          >
                            {t("currentPlanButton")}
                          </Button>
                        ) : isEnterprise ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            className="w-full"
                            onClick={() => {
                              window.location.href = "mailto:comercial@apura.pt";
                            }}
                          >
                            {t("contact")}
                          </Button>
                        ) : priceId ? (
                          <Button
                            variant="primary"
                            size="sm"
                            className="w-full"
                            onClick={() => handleUpgrade(priceId, plan.name)}
                            isLoading={isLoading}
                          >
                            {t("upgrade")}
                          </Button>
                        ) : (
                          <Button
                            variant="secondary"
                            size="sm"
                            className="w-full"
                            disabled
                          >
                            {t("unavailable")}
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
