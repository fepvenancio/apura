"use client";

import { useState, useMemo } from "react";
import { cn, formatNumber, formatCurrency, isCurrencyColumn } from "@/lib/utils";
import type { QueryResult } from "@/lib/types";
import { ChevronUp, ChevronDown } from "lucide-react";

interface ResultTableProps {
  result: QueryResult;
}

const PAGE_SIZE = 50;

export function ResultTable({ result }: ResultTableProps) {
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);

  const sortedRows = useMemo(() => {
    if (!sortCol) return result.rows;
    return [...result.rows].sort((a, b) => {
      const aVal = a[sortCol];
      const bVal = b[sortCol];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDir === "asc" ? aVal - bVal : bVal - aVal;
      }
      const aStr = String(aVal);
      const bStr = String(bVal);
      return sortDir === "asc"
        ? aStr.localeCompare(bStr, "pt")
        : bStr.localeCompare(aStr, "pt");
    });
  }, [result.rows, sortCol, sortDir]);

  const totalPages = Math.ceil(sortedRows.length / PAGE_SIZE);
  const pageRows = sortedRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
    setPage(0);
  };

  const formatCellValue = (col: string, value: unknown): string => {
    if (value == null) return "\u2014";
    if (typeof value === "number") {
      if (isCurrencyColumn(col)) return formatCurrency(value);
      return formatNumber(value);
    }
    return String(value);
  };

  if (result.rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted">
        <p className="text-sm">Sem resultados</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-card-border">
              {result.columns.map((col) => (
                <th
                  key={col.name}
                  onClick={() => handleSort(col.name)}
                  className="cursor-pointer px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted hover:text-foreground transition-colors select-none whitespace-nowrap"
                >
                  <div className="flex items-center gap-1">
                    {col.name}
                    {sortCol === col.name &&
                      (sortDir === "asc" ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      ))}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, i) => (
              <tr
                key={i}
                className={cn(
                  "border-b border-card-border/50 transition-colors hover:bg-[#1a1a1a]",
                  i % 2 === 0 ? "bg-transparent" : "bg-[#111]"
                )}
              >
                {result.columns.map((col) => (
                  <td
                    key={col.name}
                    className={cn(
                      "px-4 py-2.5 whitespace-nowrap",
                      typeof row[col.name] === "number"
                        ? "text-right tabular-nums"
                        : "text-left"
                    )}
                  >
                    {formatCellValue(col.name, row[col.name])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-card-border px-4 py-3">
          <span className="text-xs text-muted">
            {sortedRows.length} {sortedRows.length === 1 ? "linha" : "linhas"}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="rounded px-2 py-1 text-xs text-muted hover:text-foreground disabled:opacity-30 cursor-pointer"
            >
              Anterior
            </button>
            <span className="text-xs text-muted">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="rounded px-2 py-1 text-xs text-muted hover:text-foreground disabled:opacity-30 cursor-pointer"
            >
              Seguinte
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
