"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { SchemaTable } from "@/lib/types";
import { Topbar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Database, ChevronDown, ChevronRight, Key, Link2 } from "lucide-react";

const CATEGORIES = [
  { key: "all", label: "Todas" },
  { key: "vendas", label: "Vendas" },
  { key: "compras", label: "Compras" },
  { key: "financeiro", label: "Financeiro" },
  { key: "stocks", label: "Stocks" },
  { key: "rh", label: "RH" },
  { key: "tesouraria", label: "Tesouraria" },
];

export default function SchemaPage() {
  const [tables, setTables] = useState<SchemaTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [expandedTable, setExpandedTable] = useState<string | null>(null);

  useEffect(() => {
    api
      .getSchema()
      .then(setTables)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = tables.filter((t) => {
    const matchesCategory =
      activeCategory === "all" || t.category === activeCategory;
    const matchesSearch =
      !search ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.columns.some((c) =>
        c.name.toLowerCase().includes(search.toLowerCase())
      );
    return matchesCategory && matchesSearch;
  });

  return (
    <div>
      <Topbar title="Esquema" />

      <div className="p-6 space-y-6">
        {/* Search */}
        <Input
          placeholder="Pesquisar tabelas ou colunas..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {/* Category tabs */}
        <div className="flex items-center gap-1 overflow-x-auto">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                activeCategory === cat.key
                  ? "bg-primary text-white"
                  : "text-muted hover:bg-[#1a1a1a] hover:text-foreground"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted">
            <p className="text-sm">A carregar...</p>
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <div className="flex flex-col items-center justify-center py-16 text-muted">
              <Database className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm">Nenhuma tabela encontrada.</p>
            </div>
          </Card>
        ) : (
          <Card>
            <div className="divide-y divide-card-border">
              {filtered.map((table) => (
                <div key={table.name}>
                  <button
                    onClick={() =>
                      setExpandedTable(
                        expandedTable === table.name ? null : table.name
                      )
                    }
                    className="flex items-center gap-3 w-full px-6 py-3 hover:bg-[#1a1a1a] transition-colors cursor-pointer text-left"
                  >
                    {expandedTable === table.name ? (
                      <ChevronDown className="h-4 w-4 text-muted shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-foreground">
                        {table.name}
                      </span>
                      {table.description && (
                        <span className="text-xs text-muted ml-2">
                          {table.description}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="muted">{table.category}</Badge>
                      <span className="text-xs text-muted">
                        {table.columns.length} colunas
                      </span>
                      {table.rowCount !== undefined && (
                        <span className="text-xs text-muted">
                          {table.rowCount.toLocaleString("pt-PT")} linhas
                        </span>
                      )}
                    </div>
                  </button>

                  {expandedTable === table.name && (
                    <div className="px-6 pb-4">
                      <div className="overflow-x-auto rounded-lg border border-card-border">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-card-border bg-[#0d0d0d]">
                              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                                Coluna
                              </th>
                              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                                Tipo
                              </th>
                              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                                Descricao
                              </th>
                              <th className="px-4 py-2 text-center text-xs font-semibold uppercase tracking-wider text-muted">
                                Chaves
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-card-border/50">
                            {table.columns.map((col) => (
                              <tr
                                key={col.name}
                                className="hover:bg-[#1a1a1a] transition-colors"
                              >
                                <td className="px-4 py-2 font-mono text-xs text-foreground">
                                  {col.name}
                                  {col.nullable && (
                                    <span className="text-muted ml-1">?</span>
                                  )}
                                </td>
                                <td className="px-4 py-2">
                                  <Badge variant="muted">{col.type}</Badge>
                                </td>
                                <td className="px-4 py-2 text-xs text-muted">
                                  {col.description || "\u2014"}
                                </td>
                                <td className="px-4 py-2 text-center">
                                  <div className="flex items-center justify-center gap-1">
                                    {col.isPrimaryKey && (
                                      <Key className="h-3.5 w-3.5 text-warning" />
                                    )}
                                    {col.isForeignKey && (
                                      <span className="inline-flex items-center gap-0.5 text-xs text-primary">
                                        <Link2 className="h-3.5 w-3.5" />
                                        {col.referencesTable}
                                      </span>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
