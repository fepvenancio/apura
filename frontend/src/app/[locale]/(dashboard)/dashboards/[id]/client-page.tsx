"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import type { Dashboard, DashboardWidget } from "@/lib/types";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, GripVertical, Trash2, Save } from "lucide-react";
import { useTranslations } from "next-intl";

export function DashboardDetailClient() {
  const t = useTranslations("dashboards");
  const tc = useTranslations("common");
  const params = useParams();
  const id = params.id as string;
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .getDashboard(id)
      .then(setDashboard)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const handleRemoveWidget = (widgetId: string) => {
    if (!dashboard) return;
    setDashboard({
      ...dashboard,
      widgets: dashboard.widgets.filter((w) => w.id !== widgetId),
    });
  };

  const handleSaveLayout = async () => {
    if (!dashboard) return;
    setSaving(true);
    try {
      const updated = await api.updateDashboard(dashboard.id, {
        widgets: dashboard.widgets,
      });
      setDashboard(updated);
      setEditMode(false);
    } catch {
      // Ignore
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div>
        <Topbar title={t("title")} />
        <div className="flex items-center justify-center py-16 text-muted">
          <p className="text-sm">{tc("loading")}</p>
        </div>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div>
        <Topbar title={t("title")} />
        <div className="flex items-center justify-center py-16 text-muted">
          <p className="text-sm">{t("detailNotFound")}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Topbar title={dashboard.name} />

      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            {dashboard.description && (
              <p className="text-sm text-muted">{dashboard.description}</p>
            )}
            <div className="flex items-center gap-2 mt-1">
              {dashboard.shared && (
                <Badge variant="primary">{t("shared")}</Badge>
              )}
              <span className="text-xs text-muted">
                {t("widgets", { count: (dashboard.widgets?.length ?? 0) })}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {editMode ? (
              <>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSaveLayout}
                  isLoading={saving}
                >
                  <Save className="h-3.5 w-3.5" />
                  {tc("save")}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setEditMode(false)}
                >
                  {tc("cancel")}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setEditMode(true)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  {t("editLayout")}
                </Button>
                <Button variant="primary" size="sm">
                  <Plus className="h-3.5 w-3.5" />
                  {t("addWidget")}
                </Button>
              </>
            )}
          </div>
        </div>

        {(dashboard.widgets?.length ?? 0) === 0 ? (
          <Card>
            <div className="flex flex-col items-center justify-center py-16 text-muted">
              <p className="text-sm">{t("emptyWidgets")}</p>
              <p className="text-xs mt-1">
                {t("emptyWidgetsHint")}
              </p>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {dashboard.widgets.map((widget: DashboardWidget) => (
              <Card key={widget.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {editMode && (
                        <GripVertical className="h-4 w-4 text-muted cursor-grab" />
                      )}
                      <h3 className="text-sm font-semibold truncate">
                        {widget.reportName}
                      </h3>
                    </div>
                    {editMode && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveWidget(widget.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-danger" />
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-center py-8 text-muted">
                    <p className="text-xs">{t("widgetVisualization")}</p>
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
