"use client";

import { useEffect, useState } from "react";
import { useConnectorStore } from "@/stores/connector-store";
import { useQueryStore } from "@/stores/query-store";
import { api } from "@/lib/api";
import type { UsageInfo } from "@/lib/types";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { QueryInput } from "@/components/query/query-input";
import { ResultPanel } from "@/components/query/result-panel";
import { formatRelativeDate } from "@/lib/utils";
import { Clock } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";

export default function DashboardPage() {
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");
  const locale = useLocale();
  const connectorStatus = useConnectorStore((s) => s.status);
  const result = useQueryStore((s) => s.result);
  const history = useQueryStore((s) => s.history);
  const loadHistory = useQueryStore((s) => s.loadHistory);
  const [usage, setUsage] = useState<UsageInfo | null>(null);

  useEffect(() => {
    loadHistory();
    api.getUsage().then(setUsage).catch(() => {});
  }, [loadHistory]);

  const fullLocale = locale === "pt" ? "pt-PT" : locale === "es" ? "es-ES" : "en-US";

  return (
    <div>
      <Topbar
        title={t("title")}
        queriesUsed={usage?.queriesUsed}
        queriesLimit={usage?.queriesLimit}
      />

      <div className="p-6 space-y-6">
        {/* Stats row — dense, no icons in boxes */}
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="py-3 px-4">
              <p className="text-[11px] uppercase tracking-wide text-muted">{t("queries")}</p>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-xl font-semibold tabular-nums">
                  {usage?.queriesUsed ?? "\u2014"}
                </span>
                <span className="text-xs text-muted">
                  / {usage?.queriesLimit ?? "\u2014"}
                </span>
              </div>
              {usage && (
                <div className="mt-2 h-1 w-full rounded-full bg-[#1a1a1a] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{
                      width: `${Math.min(
                        (usage.queriesUsed / usage.queriesLimit) * 100,
                        100
                      )}%`,
                    }}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="py-3 px-4">
              <p className="text-[11px] uppercase tracking-wide text-muted">{t("connectorLabel")}</p>
              <div className="mt-1">
                <Badge
                  variant={
                    connectorStatus === "connected" ? "success" : "danger"
                  }
                  dot
                >
                  {connectorStatus === "connected"
                    ? t("connectorConnected")
                    : connectorStatus === "checking"
                    ? t("connectorChecking")
                    : t("connectorDisconnected")}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="py-3 px-4">
              <p className="text-[11px] uppercase tracking-wide text-muted">{t("plan")}</p>
              <p className="text-xl font-semibold capitalize mt-1">
                {usage?.plan ?? "\u2014"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Quick query */}
        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold">{t("quickQuery")}</h3>
          </CardHeader>
          <CardContent>
            <QueryInput />
            {result && <ResultPanel result={result} />}
          </CardContent>
        </Card>

        {/* Recent queries */}
        {history.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">{t("recentQueries")}</h3>
                <Link
                  href={`/${locale}/history`}
                  className="text-xs text-primary hover:text-primary-hover transition-colors"
                >
                  {tc("viewAll")}
                </Link>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-card-border">
                {history.slice(0, 5).map((q) => (
                  <Link
                    key={q.id}
                    href={`/${locale}/query?id=${q.id}`}
                    className="flex items-center gap-3 px-6 py-3 hover:bg-[#1a1a1a] transition-colors"
                  >
                    <Clock className="h-4 w-4 text-muted shrink-0" />
                    <span className="flex-1 text-sm truncate">
                      {q.naturalLanguage}
                    </span>
                    <span className="text-xs text-muted shrink-0">
                      {formatRelativeDate(q.createdAt, fullLocale)}
                    </span>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
