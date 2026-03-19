"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Report, QueryResult } from "@/lib/types";
import { formatNumber, formatCurrency, isCurrencyColumn } from "@/lib/utils";
import { Printer, ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import "./print.css";

const NUMERIC_TYPES = new Set(["number", "integer", "float", "decimal", "bigint", "real", "double"]);

function formatCellValue(value: unknown, colName: string, colType: string, fullLocale: string): string {
  if (value == null) return "";
  if (typeof value === "number") {
    if (isCurrencyColumn(colName)) return formatCurrency(value, fullLocale);
    return formatNumber(value, fullLocale);
  }
  return String(value);
}

export default function PrintReportPage() {
  const t = useTranslations("reports");
  const tc = useTranslations("common");
  const locale = useLocale();
  const fullLocale = locale === "pt" ? "pt-PT" : locale === "es" ? "es-ES" : "en-US";
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [report, setReport] = useState<Report | null>(null);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [r, res] = await Promise.all([
          api.getReport(id),
          api.runReport(id),
        ]);
        setReport(r);
        setResult(res);
      } catch {
        setError(t("printLoadError"));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id, t]);

  if (loading) {
    return (
      <div className="print-container">
        <p style={{ padding: "2rem", textAlign: "center", color: "#888" }}>
          {t("printLoading")}
        </p>
      </div>
    );
  }

  if (error || !report || !result) {
    return (
      <div className="print-container">
        <p style={{ padding: "2rem", textAlign: "center", color: "#c00" }}>
          {error || t("printNotFound")}
        </p>
      </div>
    );
  }

  const generatedDate = new Date().toLocaleDateString(fullLocale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="print-container">
      {/* Actions -- hidden in print */}
      <div className="actions no-print">
        <button className="btn-print" onClick={() => window.print()}>
          <Printer size={16} />
          {tc("print")}
        </button>
        <a className="btn-back" onClick={() => router.back()} role="button" tabIndex={0}>
          <ArrowLeft size={16} />
          {tc("back")}
        </a>
      </div>

      {/* Report header */}
      <h1>{report.name}</h1>
      {report.description && <p className="subtitle">{report.description}</p>}
      <p className="generated-date">{t("printGeneratedAt", { date: generatedDate })}</p>

      {/* SQL */}
      <p className="section-label">{t("printSqlLabel")}</p>
      <pre className="sql-block"><code>{result.sql}</code></pre>

      {/* Explanation */}
      {result.explanation && (
        <>
          <p className="section-label">{t("printExplanationLabel")}</p>
          <p className="explanation">{result.explanation}</p>
        </>
      )}

      {/* Data table */}
      <p className="section-label">{t("printDataLabel", { count: result.rowCount })}</p>
      <table className="data-table">
        <thead>
          <tr>
            {result.columns.map((col) => (
              <th key={col.name}>{col.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, i) => (
            <tr key={i}>
              {result.columns.map((col) => (
                <td
                  key={col.name}
                  className={NUMERIC_TYPES.has(col.type.toLowerCase()) ? "numeric" : undefined}
                >
                  {formatCellValue(row[col.name], col.name, col.type, fullLocale)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Footer */}
      <div className="footer">
        <p>{t("printFooter", { date: generatedDate })}</p>
      </div>
    </div>
  );
}
