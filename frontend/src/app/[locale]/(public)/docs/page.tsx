"use client";

import { useTranslations } from "next-intl";

export default function DocsPage() {
  const t = useTranslations("docs");

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-xl font-bold text-foreground mb-6">{t("title")}</h1>
      <div className="space-y-8">
        <section>
          <h2 className="text-sm font-semibold text-foreground mb-3">{t("installGuide")}</h2>
          <div className="rounded-lg border border-card-border bg-card p-5 space-y-3 text-[13px] text-muted leading-relaxed">
            <div className="flex gap-3">
              <span className="text-primary font-mono font-bold shrink-0">1.</span>
              <div>
                <p className="text-foreground font-medium">{t("step1Title")}</p>
                <p>{t("step1Text")}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="text-primary font-mono font-bold shrink-0">2.</span>
              <div>
                <p className="text-foreground font-medium">{t("step2Title")}</p>
                <p>{t("step2Text")}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="text-primary font-mono font-bold shrink-0">3.</span>
              <div>
                <p className="text-foreground font-medium">{t("step3Title")}</p>
                <p>{t("step3Text")}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="text-primary font-mono font-bold shrink-0">4.</span>
              <div>
                <p className="text-foreground font-medium">{t("step4Title")}</p>
                <p>{t("step4Text")}</p>
              </div>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-foreground mb-3">{t("requirements")}</h2>
          <div className="rounded-lg border border-card-border bg-card p-5 text-[13px]">
            <table className="w-full">
              <tbody className="divide-y divide-card-border">
                <tr><td className="py-2 text-muted">{t("reqSqlServer")}</td><td className="py-2 text-foreground">{t("reqSqlServerValue")}</td></tr>
                <tr><td className="py-2 text-muted">{t("reqPrimavera")}</td><td className="py-2 text-foreground">{t("reqPrimaveraValue")}</td></tr>
                <tr><td className="py-2 text-muted">{t("reqOs")}</td><td className="py-2 text-foreground">{t("reqOsValue")}</td></tr>
                <tr><td className="py-2 text-muted">{t("reqNetwork")}</td><td className="py-2 text-foreground">{t("reqNetworkValue")}</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-foreground mb-3">{t("securityTitle")}</h2>
          <div className="rounded-lg border border-card-border bg-card p-5 space-y-2 text-[13px] text-muted leading-relaxed">
            <p>{t("securityP1")}</p>
            <p>{t("securityP2")}</p>
            <p>{t("securityP3")}</p>
          </div>
        </section>
      </div>
    </main>
  );
}
