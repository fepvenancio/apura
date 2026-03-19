"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Report } from "@/lib/types";
import { useAuthStore } from "@/stores/auth-store";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatRelativeDate } from "@/lib/utils";
import { FileBarChart, Play, Pencil, Trash2, Share2 } from "lucide-react";

type Tab = "mine" | "shared";

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("mine");
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const userId = useAuthStore((s) => s.user?.id);

  useEffect(() => {
    api
      .getReports()
      .then(setReports)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id: string) => {
    try {
      await api.deleteReport(id);
      setReports((prev) => prev.filter((r) => r.id !== id));
    } catch {
      // Ignore
    }
  };

  const handleToggleShare = async (report: Report) => {
    setTogglingId(report.id);
    try {
      const updated = await api.updateReport(report.id, {
        isShared: !report.isShared,
      });
      setReports((prev) =>
        prev.map((r) => (r.id === updated.id ? updated : r))
      );
    } catch {
      // Ignore
    } finally {
      setTogglingId(null);
    }
  };

  const filteredReports =
    tab === "mine"
      ? reports.filter((r) => r.userId === userId)
      : reports.filter((r) => r.isShared && r.userId !== userId);

  const tabs: { key: Tab; label: string }[] = [
    { key: "mine", label: "Meus Relatorios" },
    { key: "shared", label: "Partilhados comigo" },
  ];

  return (
    <div>
      <Topbar title="Relatorios" />

      <div className="p-4 sm:p-6">
        {/* Tabs */}
        <div className="flex border-b border-card-border mb-6">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer whitespace-nowrap flex-1 sm:flex-none ${
                tab === t.key
                  ? "text-primary border-b-2 border-primary"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted">
            <p className="text-sm">A carregar...</p>
          </div>
        ) : filteredReports.length === 0 ? (
          <Card>
            <div className="flex flex-col items-center justify-center py-16 text-muted">
              <FileBarChart className="h-12 w-12 mb-3 opacity-30" />
              {tab === "mine" ? (
                <>
                  <p className="text-sm">
                    Ainda nao guardou nenhum relatorio.
                  </p>
                  <p className="text-xs mt-1">
                    Execute uma consulta e clique em &ldquo;Guardar como
                    Relatorio&rdquo;.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm">
                    Nenhum relatorio partilhado consigo.
                  </p>
                  <p className="text-xs mt-1">
                    Os membros da organizacao podem partilhar relatorios
                    consigo.
                  </p>
                </>
              )}
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredReports.map((report) => (
              <Card key={report.id}>
                <CardContent className="py-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-foreground truncate">
                          {report.name}
                        </h3>
                        {tab === "mine" && report.isShared && (
                          <Badge variant="primary">Partilhado</Badge>
                        )}
                      </div>
                      {report.description && (
                        <p className="text-xs text-muted mt-1 line-clamp-2">
                          {report.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {report.lastRunAt && (
                    <p className="text-xs text-muted mb-4">
                      Ultima execucao:{" "}
                      {formatRelativeDate(report.lastRunAt)}
                    </p>
                  )}

                  <div className="flex items-center gap-2">
                    <Button variant="primary" size="sm" className="flex-1">
                      <Play className="h-3.5 w-3.5" />
                      Executar
                    </Button>
                    <Button variant="secondary" size="sm">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {tab === "mine" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggleShare(report)}
                        disabled={togglingId === report.id}
                        title={
                          report.isShared
                            ? "Deixar de partilhar"
                            : "Partilhar"
                        }
                      >
                        <Share2
                          className={`h-3.5 w-3.5 ${
                            report.isShared
                              ? "text-primary"
                              : "text-muted"
                          }`}
                        />
                      </Button>
                    )}
                    {tab === "mine" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(report.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-danger" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
