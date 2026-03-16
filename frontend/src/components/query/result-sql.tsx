"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Copy, Check, ChevronDown, ChevronUp } from "lucide-react";

interface ResultSqlProps {
  sql: string;
}

const SQL_KEYWORDS = [
  "SELECT", "FROM", "WHERE", "JOIN", "LEFT", "RIGHT", "INNER", "OUTER",
  "FULL", "CROSS", "ON", "AND", "OR", "NOT", "IN", "EXISTS", "BETWEEN",
  "LIKE", "IS", "NULL", "AS", "ORDER", "BY", "GROUP", "HAVING", "LIMIT",
  "OFFSET", "UNION", "ALL", "INSERT", "INTO", "VALUES", "UPDATE", "SET",
  "DELETE", "CREATE", "TABLE", "ALTER", "DROP", "INDEX", "TOP", "DISTINCT",
  "COUNT", "SUM", "AVG", "MIN", "MAX", "CASE", "WHEN", "THEN", "ELSE",
  "END", "WITH", "ASC", "DESC", "OVER", "PARTITION", "ROW_NUMBER",
  "RANK", "DENSE_RANK", "COALESCE", "CAST", "CONVERT",
];

function highlightSQL(sql: string): string {
  let result = sql
    // Escape HTML
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Highlight strings (single-quoted)
  result = result.replace(
    /'([^']*)'/g,
    '<span class="sql-string">\'$1\'</span>'
  );

  // Highlight numbers
  result = result.replace(
    /\b(\d+(?:\.\d+)?)\b/g,
    '<span class="sql-number">$1</span>'
  );

  // Highlight keywords
  const keywordPattern = new RegExp(
    `\\b(${SQL_KEYWORDS.join("|")})\\b`,
    "gi"
  );
  result = result.replace(
    keywordPattern,
    '<span class="sql-keyword">$1</span>'
  );

  // Highlight comments
  result = result.replace(
    /(--.*$)/gm,
    '<span class="sql-comment">$1</span>'
  );

  return result;
}

export function ResultSql({ sql }: ResultSqlProps) {
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const highlighted = useMemo(() => highlightSQL(sql), [sql]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-1 text-sm text-muted hover:text-foreground transition-colors cursor-pointer"
        >
          {collapsed ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronUp className="h-4 w-4" />
          )}
          SQL Gerado
        </button>
        <button
          onClick={handleCopy}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition-colors cursor-pointer",
            copied
              ? "text-success"
              : "text-muted hover:text-foreground"
          )}
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" />
              Copiado
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              Copiar
            </>
          )}
        </button>
      </div>

      {!collapsed && (
        <pre className="overflow-x-auto rounded-lg border border-card-border bg-[#0d0d0d] p-4 text-sm leading-relaxed">
          <code dangerouslySetInnerHTML={{ __html: highlighted }} />
        </pre>
      )}
    </div>
  );
}
