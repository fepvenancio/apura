"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import type { QueryResult } from "@/lib/types";
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

const tabs: { id: TabId; label: string }[] = [
  { id: "tabela", label: "Tabela" },
  { id: "grafico", label: "Gr\u00e1fico" },
  { id: "sql", label: "SQL" },
  { id: "explicacao", label: "Explica\u00e7\u00e3o" },
];

export function ResultPanel({ result }: ResultPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>("tabela");

  const handleExportCSV = useCallback(() => {
    if (!result.columns.length || !result.rows.length) return;

    const header = result.columns.map((c) => c.name).join(",");
    const rows = result.rows.map((row) =>
      result.columns
        .map((col) => {
          const val = row[col.name];
          if (val == null) return "";
          const str = String(val);
          if (str.includes(",") || str.includes('"') || str.includes("\n")) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(",")
    );

    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `apura-resultado-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [result]);

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
            Guardar como Relat\u00f3rio
          </Button>
          <Button variant="ghost" size="sm" onClick={handleExportCSV}>
            <Download className="h-3.5 w-3.5" />
            Exportar CSV
          </Button>
        </div>
      </div>

      {/* Tab content */}
      <div className="p-4">
        {/* Execution stats */}
        <div className="mb-4 flex items-center gap-4 text-xs text-muted">
          <span>{result.rowCount} {result.rowCount === 1 ? "linha" : "linhas"}</span>
          <span>{result.executionTimeMs}ms</span>
        </div>

        {activeTab === "tabela" && <ResultTable result={result} />}
        {activeTab === "grafico" && <ResultChart result={result} />}
        {activeTab === "sql" && <ResultSql sql={result.sql} />}
        {activeTab === "explicacao" && (
          <div className="prose prose-invert max-w-none">
            <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">
              {result.explanation || "Sem explica\u00e7\u00e3o dispon\u00edvel."}
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
