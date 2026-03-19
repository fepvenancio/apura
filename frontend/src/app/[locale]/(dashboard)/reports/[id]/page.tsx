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
import { downloadCsv } from "@/lib/csv";
import { Play, Save, Download, Pencil, X, Printer } from "lucide-react";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";

export default function ReportDetailPage() {
  const t = useTranslations("reports");
  const tc = useTranslations("common");
  const locale = useLocale();
  const fullLocale = locale === "pt" ? "pt-PT" : locale === "es" ? "es-ES" : "en-US";
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

  if (loading) {
    return (
      <div>
        <Topbar title={t("detailTitle")} />
        <div className="flex items-center justify-center py-16 text-muted">
          <p className="text-sm">{tc("loading")}</p>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div>
        <Topbar title={t("detailTitle")} />
        <div className="flex items-center justify-center py-16 text-muted">
          <p className="text-sm">{t("detailNotFound")}</p>
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
              <h3 className="text-sm font-semibold">{t("detailSection")}</h3>
              {!editing && (
                <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                  <Pencil className="h-3.5 w-3.5" />
                  {tc("edit")}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {editing ? (
              <div className="space-y-4">
                <Input
                  label={t("editName")}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                />
                <Input
                  label={t("editDescription")}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                />
                <div className="flex items-center gap-2">
                  <Button variant="primary" size="sm" onClick={handleSave} isLoading={saving}>
                    <Save className="h-3.5 w-3.5" />
                    {tc("save")}
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>
                    <X className="h-3.5 w-3.5" />
                    {tc("cancel")}
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
                    {t("lastRun", { time: formatRelativeDate(report.lastRunAt, fullLocale) })}
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
            {t("runReport")}
          </Button>
          {result && (
            <>
              <Button variant="secondary" onClick={() => downloadCsv(result.columns, result.rows, `${report?.name || "report"}.csv`)}>
                <Download className="h-4 w-4" />
                {t("exportCsv")}
              </Button>
              <Button variant="secondary" onClick={() => window.open(`/${locale}/reports/${id}/print`, '_blank')}>
                <Printer className="h-4 w-4" />
                {t("printReport")}
              </Button>
            </>
          )}
        </div>

        {/* Results */}
        {result && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">{t("results")}</h3>
                <Badge variant="success">
                  {tc("rows", { count: result.rowCount })} &mdash;{" "}
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
