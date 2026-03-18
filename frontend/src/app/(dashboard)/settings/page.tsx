"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { OrgSettings } from "@/lib/types";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

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
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setError("Erro ao guardar definicoes.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Topbar title="Definicoes" />

      <div className="max-w-3xl p-6">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted">
            <p className="text-sm">A carregar...</p>
          </div>
        ) : settings ? (
          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold">Organizacao</h3>
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
                    Definicoes guardadas com sucesso.
                  </div>
                )}

                <Input
                  label="Nome da organizacao"
                  value={settings.name}
                  onChange={(e) =>
                    setSettings({ ...settings, name: e.target.value })
                  }
                  required
                />

                <Input
                  label="Email de faturacao"
                  type="email"
                  value={settings.billingEmail}
                  onChange={(e) =>
                    setSettings({ ...settings, billingEmail: e.target.value })
                  }
                  required
                />

                <div className="flex flex-col gap-1">
                  <label className="text-[13px] font-medium text-foreground/80">
                    Fuso horario
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
                    Pais
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
                  Guardar
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <div className="flex flex-col items-center justify-center py-16 text-muted">
              <p className="text-sm">Erro ao carregar definicoes.</p>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
