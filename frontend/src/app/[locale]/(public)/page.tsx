"use client";

import Link from "next/link";
import { Database, Shield, Zap, BarChart3, Clock, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";

export default function HomePage() {
  const t = useTranslations("landing");
  const locale = useLocale();

  const features = [
    { icon: Database, title: t("featureReadOnly"), desc: t("featureReadOnlyDesc") },
    { icon: Shield, title: t("featureLocalData"), desc: t("featureLocalDataDesc") },
    { icon: Zap, title: t("featureFastResponses"), desc: t("featureFastResponsesDesc") },
    { icon: BarChart3, title: t("featureAutoCharts"), desc: t("featureAutoChartsDesc") },
    { icon: Clock, title: t("featureScheduledReports"), desc: t("featureScheduledReportsDesc") },
    { icon: Users, title: t("featureTeamPermissions"), desc: t("featureTeamPermissionsDesc") },
  ];

  return (
    <main>
      {/* Hero */}
      <section className="mx-auto max-w-5xl px-6 pt-20 pb-16">
        <div className="max-w-2xl">
          <p className="text-[13px] font-medium text-primary mb-4">
            {t("heroSubtitle")}
          </p>
          <h1 className="text-4xl font-bold tracking-tight text-foreground leading-tight">
            {t("heroTitle")}
            <br />
            <span className="text-muted">{t("heroTitleHighlight")}</span>
          </h1>
          <p className="mt-5 text-base text-muted leading-relaxed max-w-lg">
            {t("heroDescription")}
          </p>
          <div className="mt-8 flex items-center gap-3">
            <Link
              href={`/${locale}/signup`}
              className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-hover transition-colors"
            >
              {t("heroCta")}
            </Link>
            <Link
              href={`/${locale}/pricing`}
              className="rounded-md border border-card-border px-5 py-2.5 text-sm font-medium text-foreground hover:bg-card transition-colors"
            >
              {t("heroPricing")}
            </Link>
          </div>
          <p className="mt-4 text-[12px] text-muted/60">
            {t("heroTrialText")}
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
              {t("demoQuery")}
            </div>
            <div className="mt-4 flex items-center gap-3 text-[12px] text-muted">
              <span className="flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-success" />
                {t("demoResults")}
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
                    <th className="px-4 py-2 text-left font-medium text-muted">{t("demoTableClient")}</th>
                    <th className="px-4 py-2 text-right font-medium text-muted">{t("demoTableBilling")}</th>
                    <th className="px-4 py-2 text-right font-medium text-muted">{t("demoTableDocs")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-card-border">
                  {[
                    { n: 1, name: "Construcoes Atlantico Lda", val: "1.245.000", docs: 342 },
                    { n: 2, name: "TechPort Solutions SA", val: "987.500", docs: 198 },
                    { n: 3, name: "Distribuicao Global SARL", val: "756.200", docs: 267 },
                    { n: 4, name: "Metalurgica do Norte Lda", val: "623.800", docs: 145 },
                    { n: 5, name: "Agro-Industria Sul SA", val: "512.300", docs: 189 },
                  ].map((row) => (
                    <tr key={row.n} className="hover:bg-[#111]">
                      <td className="px-4 py-2 text-muted tabular-nums">{row.n}</td>
                      <td className="px-4 py-2 text-foreground">{row.name}</td>
                      <td className="px-4 py-2 text-right text-foreground font-mono tabular-nums">{row.val} EUR</td>
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
          <h2 className="text-xl font-semibold text-foreground mb-2">{t("howItWorksTitle")}</h2>
          <p className="text-sm text-muted mb-10">{t("howItWorksSubtitle")}</p>

          <div className="grid grid-cols-3 gap-6">
            <div className="rounded-lg border border-card-border p-5">
              <div className="text-[11px] uppercase tracking-wider text-primary font-medium mb-3">{t("step1Label")}</div>
              <h3 className="text-sm font-medium text-foreground mb-1.5">{t("step1Title")}</h3>
              <p className="text-[13px] text-muted leading-relaxed">
                {t("step1Text")}
              </p>
            </div>
            <div className="rounded-lg border border-card-border p-5">
              <div className="text-[11px] uppercase tracking-wider text-primary font-medium mb-3">{t("step2Label")}</div>
              <h3 className="text-sm font-medium text-foreground mb-1.5">{t("step2Title")}</h3>
              <p className="text-[13px] text-muted leading-relaxed">
                {t("step2Text")}
              </p>
            </div>
            <div className="rounded-lg border border-card-border p-5">
              <div className="text-[11px] uppercase tracking-wider text-primary font-medium mb-3">{t("step3Label")}</div>
              <h3 className="text-sm font-medium text-foreground mb-1.5">{t("step3Title")}</h3>
              <p className="text-[13px] text-muted leading-relaxed">
                {t("step3Text")}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-card-border py-20">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-xl font-semibold text-foreground mb-2">{t("featuresTitle")}</h2>
          <p className="text-sm text-muted mb-10">{t("featuresSubtitle")}</p>

          <div className="grid grid-cols-3 gap-4">
            {features.map((feature) => (
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
            {t("ctaTitle")}
          </h2>
          <p className="text-sm text-muted mb-6">
            {t("ctaSubtitle")}
          </p>
          <Link
            href={`/${locale}/signup`}
            className="inline-block rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-primary-hover transition-colors"
          >
            {t("ctaButton")}
          </Link>
        </div>
      </section>
    </main>
  );
}
