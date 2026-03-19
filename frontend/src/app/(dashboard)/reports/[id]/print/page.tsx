"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Report, QueryResult } from "@/lib/types";
import { formatNumber, formatCurrency, isCurrencyColumn } from "@/lib/utils";
import { Printer, ArrowLeft } from "lucide-react";
import "./print.css";

const NUMERIC_TYPES = new Set(["number", "integer", "float", "decimal", "bigint", "real", "double"]);

function formatCellValue(value: unknown, colName: string, colType: string): string {
  if (value == null) return "";
  if (typeof value === "number") {
    if (isCurrencyColumn(colName)) return formatCurrency(value);
    return formatNumber(value);
  }
  return String(value);
}

export default function PrintReportPage() {
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
        setError("Nao foi possivel carregar o relatorio.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="print-container">
        <p style={{ padding: "2rem", textAlign: "center", color: "#888" }}>
          A carregar relatorio...
        </p>
      </div>
    );
  }

  if (error || !report || !result) {
    return (
      <div className="print-container">
        <p style={{ padding: "2rem", textAlign: "center", color: "#c00" }}>
          {error || "Relatorio nao encontrado."}
        </p>
      </div>
    );
  }

  const generatedDate = new Date().toLocaleDateString("pt-PT", {
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
          Imprimir
        </button>
        <a className="btn-back" onClick={() => router.back()} role="button" tabIndex={0}>
          <ArrowLeft size={16} />
          Voltar
        </a>
      </div>

      {/* Report header */}
      <h1>{report.name}</h1>
      {report.description && <p className="subtitle">{report.description}</p>}
      <p className="generated-date">Gerado em: {generatedDate}</p>

      {/* SQL */}
      <p className="section-label">Consulta SQL</p>
      <pre className="sql-block"><code>{result.sql}</code></pre>

      {/* Explanation */}
      {result.explanation && (
        <>
          <p className="section-label">Explicacao</p>
          <p className="explanation">{result.explanation}</p>
        </>
      )}

      {/* Data table */}
      <p className="section-label">Dados ({result.rowCount} linha{result.rowCount !== 1 ? "s" : ""})</p>
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
                  {formatCellValue(row[col.name], col.name, col.type)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Footer */}
      <div className="footer">
        <p>Apura &mdash; Gerado em {generatedDate}</p>
      </div>
    </div>
  );
}
