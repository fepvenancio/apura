"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Report } from "@/lib/types";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Clock, X } from "lucide-react";

type FrequencyPreset = "daily" | "weekly" | "monthly";

const TIMEZONES = [
  "Europe/Lisbon",
  "Europe/Madrid",
  "America/Sao_Paulo",
  "UTC",
];

const DAYS_OF_WEEK = [
  { value: "0", label: "Domingo" },
  { value: "1", label: "Segunda" },
  { value: "2", label: "Terca" },
  { value: "3", label: "Quarta" },
  { value: "4", label: "Quinta" },
  { value: "5", label: "Sexta" },
  { value: "6", label: "Sabado" },
];

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function NewSchedulePage() {
  const router = useRouter();
  const [reports, setReports] = useState<Report[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [reportId, setReportId] = useState("");
  const [preset, setPreset] = useState<FrequencyPreset>("daily");
  const [hour, setHour] = useState("08");
  const [minute, setMinute] = useState("00");
  const [dayOfWeek, setDayOfWeek] = useState("1");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [timezone, setTimezone] = useState("Europe/Lisbon");
  const [outputFormat, setOutputFormat] = useState("csv");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getReports()
      .then(setReports)
      .catch(() => {})
      .finally(() => setLoadingReports(false));
  }, []);

  const buildCron = (): string => {
    const m = minute;
    const h = hour;
    switch (preset) {
      case "daily":
        return `${m} ${h} * * *`;
      case "weekly":
        return `${m} ${h} * * ${dayOfWeek}`;
      case "monthly":
        return `${m} ${h} ${dayOfMonth} * *`;
    }
  };

  const addRecipient = () => {
    const email = emailInput.trim();
    if (!email) return;
    if (!isValidEmail(email)) {
      setEmailError("Email invalido");
      return;
    }
    if (recipients.includes(email)) {
      setEmailError("Email ja adicionado");
      return;
    }
    setRecipients((prev) => [...prev, email]);
    setEmailInput("");
    setEmailError(null);
  };

  const removeRecipient = (email: string) => {
    setRecipients((prev) => prev.filter((e) => e !== email));
  };

  const handleEmailKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addRecipient();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportId) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.createSchedule({
        reportId,
        cronExpression: buildCron(),
        timezone,
        outputFormat,
        recipients: recipients.length > 0 ? recipients : undefined,
      });
      router.push("/schedules");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao criar agendamento"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const selectClasses =
    "w-full rounded-md border border-card-border bg-background px-3 py-2 text-sm text-foreground transition-colors focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/60";

  return (
    <div>
      <Topbar title="Novo Agendamento" />

      <div className="p-4 sm:p-6 max-w-2xl">
        <Card>
          <CardContent className="py-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Report selector */}
              <div className="flex flex-col gap-1">
                <label className="text-[13px] font-medium text-foreground/80">
                  Relatorio *
                </label>
                {loadingReports ? (
                  <p className="text-xs text-muted">A carregar relatorios...</p>
                ) : (
                  <select
                    value={reportId}
                    onChange={(e) => setReportId(e.target.value)}
                    required
                    className={selectClasses}
                  >
                    <option value="">Selecione um relatorio</option>
                    {reports.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Frequency preset */}
              <div className="flex flex-col gap-2">
                <label className="text-[13px] font-medium text-foreground/80">
                  Frequencia
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  {(
                    [
                      { key: "daily", label: "Diario" },
                      { key: "weekly", label: "Semanal" },
                      { key: "monthly", label: "Mensal" },
                    ] as const
                  ).map(({ key, label }) => (
                    <label
                      key={key}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border cursor-pointer transition-colors text-sm flex-1 ${
                        preset === key
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-card-border text-muted hover:border-foreground/20"
                      }`}
                    >
                      <input
                        type="radio"
                        name="preset"
                        value={key}
                        checked={preset === key}
                        onChange={() => setPreset(key)}
                        className="sr-only"
                      />
                      <Clock className="h-4 w-4" />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              {/* Time picker */}
              <div className="flex flex-col sm:flex-row gap-4">
                {preset === "weekly" && (
                  <div className="flex flex-col gap-1 flex-1">
                    <label className="text-[13px] font-medium text-foreground/80">
                      Dia da semana
                    </label>
                    <select
                      value={dayOfWeek}
                      onChange={(e) => setDayOfWeek(e.target.value)}
                      className={selectClasses}
                    >
                      {DAYS_OF_WEEK.map((d) => (
                        <option key={d.value} value={d.value}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {preset === "monthly" && (
                  <div className="flex flex-col gap-1 flex-1">
                    <label className="text-[13px] font-medium text-foreground/80">
                      Dia do mes (1-28)
                    </label>
                    <Input
                      type="number"
                      min={1}
                      max={28}
                      value={dayOfMonth}
                      onChange={(e) => setDayOfMonth(e.target.value)}
                    />
                  </div>
                )}

                <div className="flex gap-2 flex-1">
                  <div className="flex flex-col gap-1 flex-1">
                    <label className="text-[13px] font-medium text-foreground/80">
                      Hora
                    </label>
                    <select
                      value={hour}
                      onChange={(e) => setHour(e.target.value)}
                      className={selectClasses}
                    >
                      {Array.from({ length: 24 }, (_, i) => (
                        <option key={i} value={String(i)}>
                          {String(i).padStart(2, "0")}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1 flex-1">
                    <label className="text-[13px] font-medium text-foreground/80">
                      Minuto
                    </label>
                    <select
                      value={minute}
                      onChange={(e) => setMinute(e.target.value)}
                      className={selectClasses}
                    >
                      {[0, 15, 30, 45].map((m) => (
                        <option key={m} value={String(m)}>
                          {String(m).padStart(2, "0")}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Timezone */}
              <div className="flex flex-col gap-1">
                <label className="text-[13px] font-medium text-foreground/80">
                  Fuso horario
                </label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className={selectClasses}
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </div>

              {/* Output format */}
              <div className="flex flex-col gap-1">
                <label className="text-[13px] font-medium text-foreground/80">
                  Formato de saida
                </label>
                <select
                  value={outputFormat}
                  onChange={(e) => setOutputFormat(e.target.value)}
                  className={selectClasses}
                >
                  <option value="csv">CSV</option>
                  <option value="html">HTML</option>
                </select>
              </div>

              {/* Recipients */}
              <div className="flex flex-col gap-2">
                <label className="text-[13px] font-medium text-foreground/80">
                  Destinatarios (email)
                </label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Input
                      type="email"
                      placeholder="email@exemplo.com"
                      value={emailInput}
                      onChange={(e) => {
                        setEmailInput(e.target.value);
                        setEmailError(null);
                      }}
                      onKeyDown={handleEmailKeyDown}
                      error={emailError || undefined}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    onClick={addRecipient}
                  >
                    Adicionar
                  </Button>
                </div>
                {recipients.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-1">
                    {recipients.map((email) => (
                      <span
                        key={email}
                        className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-3 py-1 text-xs text-primary"
                      >
                        {email}
                        <button
                          type="button"
                          onClick={() => removeRecipient(email)}
                          className="hover:text-foreground transition-colors cursor-pointer"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Error message */}
              {error && (
                <div className="rounded-md bg-danger/10 border border-danger/20 px-4 py-3">
                  <p className="text-sm text-danger">{error}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => router.push("/schedules")}
                  className="sm:w-auto"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={submitting}
                  disabled={!reportId}
                  className="sm:w-auto"
                >
                  Criar Agendamento
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
