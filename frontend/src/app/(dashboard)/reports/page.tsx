"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Report } from "@/lib/types";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatRelativeDate } from "@/lib/utils";
import { FileBarChart, Play, Pencil, Trash2 } from "lucide-react";

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div>
      <Topbar title="Relat\u00f3rios" />

      <div className="p-6">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted">
            <p className="text-sm">A carregar...</p>
          </div>
        ) : reports.length === 0 ? (
          <Card>
            <div className="flex flex-col items-center justify-center py-16 text-muted">
              <FileBarChart className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm">Ainda n\u00e3o guardou nenhum relat\u00f3rio.</p>
              <p className="text-xs mt-1">
                Execute uma consulta e clique em &ldquo;Guardar como Relat\u00f3rio&rdquo;.
              </p>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {reports.map((report) => (
              <Card key={report.id}>
                <CardContent className="py-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground truncate">
                        {report.name}
                      </h3>
                      {report.description && (
                        <p className="text-xs text-muted mt-1 line-clamp-2">
                          {report.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {report.lastRunAt && (
                    <p className="text-xs text-muted mb-4">
                      \u00daltima execu\u00e7\u00e3o:{" "}
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
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(report.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-danger" />
                    </Button>
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
