"use client";

import { useEffect } from "react";
import { useQueryStore } from "@/stores/query-store";
import { Topbar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import Link from "next/link";

export default function HistoryPage() {
  const history = useQueryStore((s) => s.history);
  const historyPage = useQueryStore((s) => s.historyPage);
  const historyTotalPages = useQueryStore((s) => s.historyTotalPages);
  const loadHistory = useQueryStore((s) => s.loadHistory);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  return (
    <div>
      <Topbar title="Histórico" />

      <div className="p-6">
        <Card>
          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted">
              <p className="text-sm">Ainda não fez nenhuma consulta.</p>
              <Link href="/query" className="mt-2 text-sm text-primary hover:text-primary-hover transition-colors">
                Fazer primeira consulta
              </Link>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-card-border">
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                        Data
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                        Pergunta
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                        Estado
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted">
                        Linhas
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted">
                        Tempo
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-card-border/50">
                    {history.map((q) => (
                      <tr
                        key={q.id}
                        className="hover:bg-[#1a1a1a] transition-colors"
                      >
                        <td className="px-6 py-3 text-xs text-muted whitespace-nowrap">
                          {formatDate(q.createdAt)}
                        </td>
                        <td className="px-6 py-3 max-w-md">
                          <Link
                            href={`/query?id=${q.id}`}
                            className="text-foreground hover:text-primary transition-colors truncate block"
                          >
                            {q.naturalLanguage}
                          </Link>
                        </td>
                        <td className="px-6 py-3">
                          <Badge
                            variant={
                              q.status === "success" ? "success" : "danger"
                            }
                          >
                            {q.status === "success" ? "Sucesso" : "Erro"}
                          </Badge>
                        </td>
                        <td className="px-6 py-3 text-right tabular-nums text-muted">
                          {q.rowCount}
                        </td>
                        <td className="px-6 py-3 text-right tabular-nums text-muted">
                          {q.executionTimeMs}ms
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {historyTotalPages > 1 && (
                <div className="flex items-center justify-center gap-2 border-t border-card-border py-4">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => loadHistory(historyPage - 1)}
                    disabled={historyPage <= 1}
                  >
                    Anterior
                  </Button>
                  <span className="text-xs text-muted px-2">
                    {historyPage} / {historyTotalPages}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => loadHistory(historyPage + 1)}
                    disabled={historyPage >= historyTotalPages}
                  >
                    Seguinte
                  </Button>
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
