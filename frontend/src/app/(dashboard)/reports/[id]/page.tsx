"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import type { Report, QueryResult } from "@/lib/types";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ResultPanel } from "@/components/query/result-panel";
import { formatRelativeDate } from "@/lib/utils";
import { Play, Save, Download, Pencil, X } from "lucide-react";

export default function ReportDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [report, setReport] = useState<Report | null>(null);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .getReport(id)
      .then((r) => {
        setReport(r);
        setEditName(r.name);
        setEditDescription(r.description || "");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const handleRun = async () => {
    setRunning(true);
    try {
      const res = await api.runReport(id);
      setResult(res);
    } catch {
      // Ignore
    } finally {
      setRunning(false);
    }
  };

  const handleSave = async () => {
    if (!report) return;
    setSaving(true);
    try {
      const updated = await api.updateReport(id, {
        name: editName,
        description: editDescription || undefined,
      });
      setReport(updated);
      setEditing(false);
    } catch {
      // Ignore
    } finally {
      setSaving(false);
    }
  };

  const handleExportCsv = () => {
    if (!result) return;
    const headers = result.columns.map((c) => c.name).join(",");
    const rows = result.rows
      .map((row) =>
        result.columns
          .map((c) => {
            const val = row[c.name];
            return typeof val === "string" ? `"${val.replace(/"/g, '""')}"` : val;
          })
          .join(",")
      )
      .join("\n");
    const csv = `${headers}\n${rows}`;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report?.name || "report"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div>
        <Topbar title="Relatorio" />
        <div className="flex items-center justify-center py-16 text-muted">
          <p className="text-sm">A carregar...</p>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div>
        <Topbar title="Relatorio" />
        <div className="flex items-center justify-center py-16 text-muted">
          <p className="text-sm">Relatorio nao encontrado.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Topbar title={report.name} />

      <div className="max-w-5xl p-6 space-y-6">
        {/* Report info */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Detalhes do relatorio</h3>
              {!editing && (
                <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                  <Pencil className="h-3.5 w-3.5" />
                  Editar
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {editing ? (
              <div className="space-y-4">
                <Input
                  label="Nome"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                />
                <Input
                  label="Descricao"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                />
                <div className="flex items-center gap-2">
                  <Button variant="primary" size="sm" onClick={handleSave} isLoading={saving}>
                    <Save className="h-3.5 w-3.5" />
                    Guardar
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>
                    <X className="h-3.5 w-3.5" />
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <h2 className="text-lg font-semibold">{report.name}</h2>
                {report.description && (
                  <p className="text-sm text-muted">{report.description}</p>
                )}
                {report.lastRunAt && (
                  <p className="text-xs text-muted">
                    Ultima execucao: {formatRelativeDate(report.lastRunAt)}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Button variant="primary" onClick={handleRun} isLoading={running}>
            <Play className="h-4 w-4" />
            Executar relatorio
          </Button>
          {result && (
            <Button variant="secondary" onClick={handleExportCsv}>
              <Download className="h-4 w-4" />
              Exportar CSV
            </Button>
          )}
        </div>

        {/* Results */}
        {result && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Resultados</h3>
                <Badge variant="success">
                  {result.rowCount} linha{result.rowCount !== 1 ? "s" : ""} &mdash;{" "}
                  {result.executionTimeMs}ms
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ResultPanel result={result} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
