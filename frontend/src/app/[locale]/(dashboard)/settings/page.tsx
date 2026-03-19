"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { OrgSettings } from "@/lib/types";
import { useAuthStore } from "@/stores/auth-store";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";

const TIMEZONES = [
  "Europe/Lisbon",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Paris",
  "Europe/Berlin",
  "America/Sao_Paulo",
  "America/New_York",
  "UTC",
];

const COUNTRIES = [
  "Portugal",
  "Brasil",
  "Espanha",
  "Franca",
  "Alemanha",
  "Reino Unido",
  "Estados Unidos",
];

export default function OrgSettingsPage() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // GDPR state
  const [exportLoading, setExportLoading] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { user, logout } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    api
      .getOrgSettings()
      .then(setSettings)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const updated = await api.updateOrgSettings(settings);
      setSettings(updated);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError(t("saveError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Topbar title={t("title")} />

      <div className="max-w-3xl p-6">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted">
            <p className="text-sm">{tc("loading")}</p>
          </div>
        ) : settings ? (
          <>
          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold">{t("orgTitle")}</h3>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="rounded-md bg-danger/10 border border-danger/20 px-3 py-2.5 text-[13px] text-danger">
                    {error}
                  </div>
                )}
                {success && (
                  <div className="rounded-md bg-success/10 border border-success/20 px-3 py-2.5 text-[13px] text-success">
                    {t("saveSuccess")}
                  </div>
                )}

                <Input
                  label={t("orgName")}
                  value={settings.name}
                  onChange={(e) =>
                    setSettings({ ...settings, name: e.target.value })
                  }
                  required
                />

                <Input
                  label={t("billingEmail")}
                  type="email"
                  value={settings.billingEmail}
                  onChange={(e) =>
                    setSettings({ ...settings, billingEmail: e.target.value })
                  }
                  required
                />

                <div className="flex flex-col gap-1">
                  <label className="text-[13px] font-medium text-foreground/80">
                    {t("timezone")}
                  </label>
                  <select
                    value={settings.timezone}
                    onChange={(e) =>
                      setSettings({ ...settings, timezone: e.target.value })
                    }
                    className="w-full rounded-md border border-card-border bg-background px-3 py-2 text-sm text-foreground transition-colors focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/60"
                  >
                    {TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[13px] font-medium text-foreground/80">
                    {t("country")}
                  </label>
                  <select
                    value={settings.country}
                    onChange={(e) =>
                      setSettings({ ...settings, country: e.target.value })
                    }
                    className="w-full rounded-md border border-card-border bg-background px-3 py-2 text-sm text-foreground transition-colors focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/60"
                  >
                    {COUNTRIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <Button type="submit" variant="primary" size="sm" isLoading={saving}>
                  {tc("save")}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* GDPR - Data Export */}
          <Card className="mt-6">
            <CardHeader>
              <h3 className="text-sm font-semibold">{t("personalData")}</h3>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-[13px] text-muted mb-3">
                  {t("personalDataText")}
                </p>
                {exportMessage && (
                  <div className="rounded-md bg-success/10 border border-success/20 px-3 py-2.5 text-[13px] text-success mb-3">
                    {exportMessage}
                  </div>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  isLoading={exportLoading}
                  onClick={async () => {
                    setExportLoading(true);
                    try {
                      const result = await api.requestDataExport();
                      setExportMessage(result.message);
                    } catch {
                      setExportMessage(t("exportError"));
                    } finally {
                      setExportLoading(false);
                    }
                  }}
                >
                  {t("exportData")}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* GDPR - Danger Zone */}
          <Card className="mt-6 border-danger/30">
            <CardHeader>
              <h3 className="text-sm font-semibold text-danger">
                {t("dangerZone")}
              </h3>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-[13px] text-muted">
                {t("dangerText")}
              </p>
              {!showDeleteConfirm ? (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  {t("deleteAccount")}
                </Button>
              ) : (
                <div className="space-y-3">
                  <p className="text-[13px] text-muted">
                    {t("deleteConfirmText")}{" "}
                    <strong className="text-foreground">{user?.email}</strong>
                  </p>
                  <Input
                    placeholder={t("deleteConfirmPlaceholder")}
                    value={deleteConfirm}
                    onChange={(e) => setDeleteConfirm(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="danger"
                      size="sm"
                      isLoading={deleteLoading}
                      disabled={deleteConfirm !== user?.email}
                      onClick={async () => {
                        setDeleteLoading(true);
                        try {
                          await api.requestAccountDeletion();
                          logout();
                          router.push(`/${locale}`);
                        } catch {
                          setDeleteLoading(false);
                        }
                      }}
                    >
                      {t("deleteConfirmButton")}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setShowDeleteConfirm(false);
                        setDeleteConfirm("");
                      }}
                    >
                      {tc("cancel")}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          </>
        ) : (
          <Card>
            <div className="flex flex-col items-center justify-center py-16 text-muted">
              <p className="text-sm">{t("loadError")}</p>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
