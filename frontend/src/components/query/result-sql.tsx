"use client";

import { useState, useMemo, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Copy, Check, ChevronDown, ChevronUp } from "lucide-react";

interface ResultSqlProps {
  sql: string;
}

const SQL_KEYWORDS = new Set([
  "SELECT", "FROM", "WHERE", "JOIN", "LEFT", "RIGHT", "INNER", "OUTER",
  "FULL", "CROSS", "ON", "AND", "OR", "NOT", "IN", "EXISTS", "BETWEEN",
  "LIKE", "IS", "NULL", "AS", "ORDER", "BY", "GROUP", "HAVING", "LIMIT",
  "OFFSET", "UNION", "ALL", "INSERT", "INTO", "VALUES", "UPDATE", "SET",
  "DELETE", "CREATE", "TABLE", "ALTER", "DROP", "INDEX", "TOP", "DISTINCT",
  "COUNT", "SUM", "AVG", "MIN", "MAX", "CASE", "WHEN", "THEN", "ELSE",
  "END", "WITH", "ASC", "DESC", "OVER", "PARTITION", "ROW_NUMBER",
  "RANK", "DENSE_RANK", "COALESCE", "CAST", "CONVERT",
]);

/**
 * Tokenize SQL into safe React elements — no dangerouslySetInnerHTML.
 */
function tokenizeSQL(sql: string): ReactNode[] {
  const tokens: ReactNode[] = [];
  // Match strings, numbers, comments, words, or any other char
  const regex = /('(?:[^'\\]|\\.)*')|(--.*)|([\w.]+)|(\S)/g;
  let match: RegExpExecArray | null;
  let lastIndex = 0;

  while ((match = regex.exec(sql)) !== null) {
    // Preserve whitespace between tokens
    if (match.index > lastIndex) {
      tokens.push(sql.slice(lastIndex, match.index));
    }
    lastIndex = regex.lastIndex;

    const [full, str, comment, word] = match;

    if (str) {
      tokens.push(
        <span key={tokens.length} className="sql-string">{full}</span>
      );
    } else if (comment) {
      tokens.push(
        <span key={tokens.length} className="sql-comment">{full}</span>
      );
    } else if (word) {
      if (SQL_KEYWORDS.has(word.toUpperCase())) {
        tokens.push(
          <span key={tokens.length} className="sql-keyword">{full}</span>
        );
      } else if (/^\d+(\.\d+)?$/.test(word)) {
        tokens.push(
          <span key={tokens.length} className="sql-number">{full}</span>
        );
      } else {
        tokens.push(full);
      }
    } else {
      tokens.push(full);
    }
  }

  // Trailing whitespace
  if (lastIndex < sql.length) {
    tokens.push(sql.slice(lastIndex));
  }

  return tokens;
}

export function ResultSql({ sql }: ResultSqlProps) {
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const highlighted = useMemo(() => tokenizeSQL(sql), [sql]);

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
          <code>{highlighted}</code>
        </pre>
      )}
    </div>
  );
}
