"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { QueryResult } from "@/lib/types";
import { downloadCsv } from "@/lib/csv";
import { ResultTable } from "./result-table";
import { ResultChart } from "./result-chart";
import { ResultSql } from "./result-sql";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Save, Download } from "lucide-react";

interface ResultPanelProps {
  result: QueryResult;
}

type TabId = "tabela" | "grafico" | "sql" | "explicacao";

export function ResultPanel({ result }: ResultPanelProps) {
  const t = useTranslations("query");
  const [activeTab, setActiveTab] = useState<TabId>("tabela");

  const tabs: { id: TabId; label: string }[] = [
    { id: "tabela", label: t("tabTable") },
    { id: "grafico", label: t("tabChart") },
    { id: "sql", label: t("tabSql") },
    { id: "explicacao", label: t("tabExplanation") },
  ];

  return (
    <Card className="mt-6">
      {/* Tabs + Actions */}
      <div className="flex items-center justify-between border-b border-card-border px-4">
        <div className="flex gap-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px cursor-pointer",
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm">
            <Save className="h-3.5 w-3.5" />
            {t("saveAsReport")}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => downloadCsv(result.columns, result.rows, `apura-resultado-${new Date().toISOString().slice(0, 10)}.csv`)}>
            <Download className="h-3.5 w-3.5" />
            {t("exportCsv")}
          </Button>
        </div>
      </div>

      {/* Tab content */}
      <div className="p-4">
        {/* Execution stats */}
        <div className="mb-4 flex items-center gap-4 text-xs text-muted">
          <span>{result.rowCount} {result.rowCount === 1 ? t("rowSingular") : t("rowPlural")}</span>
          <span>{result.executionTimeMs}ms</span>
        </div>

        {activeTab === "tabela" && <ResultTable result={result} />}
        {activeTab === "grafico" && <ResultChart result={result} />}
        {activeTab === "sql" && <ResultSql sql={result.sql} />}
        {activeTab === "explicacao" && (
          <div className="prose prose-invert max-w-none">
            <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">
              {result.explanation || t("noExplanation")}
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
