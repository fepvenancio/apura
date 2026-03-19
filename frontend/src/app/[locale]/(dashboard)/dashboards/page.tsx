"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Dashboard } from "@/lib/types";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatRelativeDate } from "@/lib/utils";
import { BarChart3, Plus, Trash2, LayoutGrid, Share2 } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";

export default function DashboardsPage() {
  const t = useTranslations("dashboards");
  const tc = useTranslations("common");
  const locale = useLocale();
  const fullLocale = locale === "pt" ? "pt-PT" : locale === "es" ? "es-ES" : "en-US";
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api
      .getDashboards()
      .then(setDashboards)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const dashboard = await api.createDashboard({
        name: newName,
        description: newDescription || undefined,
      });
      setDashboards((prev) => [dashboard, ...prev]);
      setNewName("");
      setNewDescription("");
      setShowCreate(false);
    } catch {
      // Ignore
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteDashboard(id);
      setDashboards((prev) => prev.filter((d) => d.id !== id));
    } catch {
      // Ignore
    }
  };

  return (
    <div>
      <Topbar title={t("title")} />

      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-muted">
            {t("count", { count: dashboards.length })}
          </p>
          <Button variant="primary" size="sm" onClick={() => setShowCreate(!showCreate)}>
            <Plus className="h-3.5 w-3.5" />
            {t("newDashboard")}
          </Button>
        </div>

        {showCreate && (
          <Card className="mb-6">
            <CardContent className="py-5">
              <form onSubmit={handleCreate} className="space-y-4">
                <Input
                  label={t("createName")}
                  placeholder={t("createNamePlaceholder")}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                />
                <Input
                  label={t("createDescription")}
                  placeholder={t("createDescriptionPlaceholder")}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                />
                <div className="flex items-center gap-2">
                  <Button type="submit" variant="primary" size="sm" isLoading={creating}>
                    {tc("create")}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowCreate(false)}
                  >
                    {tc("cancel")}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted">
            <p className="text-sm">{tc("loading")}</p>
          </div>
        ) : dashboards.length === 0 ? (
          <Card>
            <div className="flex flex-col items-center justify-center py-16 text-muted">
              <BarChart3 className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm">{t("emptyTitle")}</p>
              <p className="text-xs mt-1">
                {t("emptyHint")}
              </p>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {dashboards.map((dashboard) => (
              <Card key={dashboard.id}>
                <CardContent className="py-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/${locale}/dashboards/${dashboard.id}`}
                        className="font-semibold text-foreground hover:text-primary transition-colors truncate block"
                      >
                        {dashboard.name}
                      </Link>
                      {dashboard.description && (
                        <p className="text-xs text-muted mt-1 line-clamp-2">
                          {dashboard.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex items-center gap-1.5 text-xs text-muted">
                      <LayoutGrid className="h-3.5 w-3.5" />
                      {t("widgets", { count: dashboard.widgets.length })}
                    </div>
                    {dashboard.shared && (
                      <Badge variant="primary">
                        <Share2 className="h-3 w-3" />
                        {t("shared")}
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted">
                      {formatRelativeDate(dashboard.updatedAt, fullLocale)}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(dashboard.id)}
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
