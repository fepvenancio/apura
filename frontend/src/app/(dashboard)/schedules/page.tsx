"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Schedule, Report } from "@/lib/types";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { CalendarClock, Plus, Trash2, Play } from "lucide-react";

function humanCron(cron: string): string {
  const parts = cron.split(" ");
  if (parts.length < 5) return cron;
  const [min, hour, dom, , dow] = parts;
  if (dom === "*" && dow === "*") {
    return `Diario as ${hour}:${min.padStart(2, "0")}`;
  }
  if (dow !== "*" && dom === "*") {
    const days: Record<string, string> = {
      "1": "Segunda", "2": "Terca", "3": "Quarta",
      "4": "Quinta", "5": "Sexta", "6": "Sabado", "0": "Domingo",
    };
    return `${days[dow] || dow} as ${hour}:${min.padStart(2, "0")}`;
  }
  if (dom !== "*") {
    return `Dia ${dom} as ${hour}:${min.padStart(2, "0")}`;
  }
  return cron;
}

export default function SchedulesPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newReportId, setNewReportId] = useState("");
  const [newCron, setNewCron] = useState("0 8 * * *");
  const [newTimezone, setNewTimezone] = useState("Europe/Lisbon");

  useEffect(() => {
    Promise.all([api.getSchedules(), api.getReports()])
      .then(([s, r]) => {
        setSchedules(s);
        setReports(r);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReportId) return;
    setCreating(true);
    try {
      const schedule = await api.createSchedule({
        reportId: newReportId,
        cron: newCron,
        timezone: newTimezone,
      });
      setSchedules((prev) => [schedule, ...prev]);
      setShowCreate(false);
      setNewReportId("");
      setNewCron("0 8 * * *");
    } catch {
      // Ignore
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (schedule: Schedule) => {
    try {
      const updated = await api.updateSchedule(schedule.id, {
        enabled: !schedule.enabled,
      });
      setSchedules((prev) =>
        prev.map((s) => (s.id === updated.id ? updated : s))
      );
    } catch {
      // Ignore
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteSchedule(id);
      setSchedules((prev) => prev.filter((s) => s.id !== id));
    } catch {
      // Ignore
    }
  };

  const handleTrigger = async (id: string) => {
    try {
      await api.triggerSchedule(id);
    } catch {
      // Ignore
    }
  };

  return (
    <div>
      <Topbar title="Agendamentos" />

      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-muted">
            {schedules.length} agendamento{schedules.length !== 1 ? "s" : ""}
          </p>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowCreate(!showCreate)}
          >
            <Plus className="h-3.5 w-3.5" />
            Novo Agendamento
          </Button>
        </div>

        {showCreate && (
          <Card className="mb-6">
            <CardContent className="py-5">
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[13px] font-medium text-foreground/80">
                    Relatorio
                  </label>
                  <select
                    value={newReportId}
                    onChange={(e) => setNewReportId(e.target.value)}
                    required
                    className="w-full rounded-md border border-card-border bg-background px-3 py-2 text-sm text-foreground transition-colors focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/60"
                  >
                    <option value="">Selecione um relatorio</option>
                    {reports.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
                <Input
                  label="Expressao cron"
                  placeholder="0 8 * * *"
                  value={newCron}
                  onChange={(e) => setNewCron(e.target.value)}
                  required
                  description="Formato: minuto hora dia mes dia_semana"
                />
                <Input
                  label="Fuso horario"
                  placeholder="Europe/Lisbon"
                  value={newTimezone}
                  onChange={(e) => setNewTimezone(e.target.value)}
                  required
                />
                <div className="flex items-center gap-2">
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    isLoading={creating}
                  >
                    Criar
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowCreate(false)}
                  >
                    Cancelar
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted">
            <p className="text-sm">A carregar...</p>
          </div>
        ) : schedules.length === 0 ? (
          <Card>
            <div className="flex flex-col items-center justify-center py-16 text-muted">
              <CalendarClock className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm">Ainda nao criou nenhum agendamento.</p>
              <p className="text-xs mt-1">
                Clique em &ldquo;Novo Agendamento&rdquo; para comecar.
              </p>
            </div>
          </Card>
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-card-border">
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                      Relatorio
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                      Frequencia
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                      Proxima execucao
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                      Ultima execucao
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted">
                      Estado
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted">
                      Acoes
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-card-border/50">
                  {schedules.map((schedule) => (
                    <tr
                      key={schedule.id}
                      className="hover:bg-[#1a1a1a] transition-colors"
                    >
                      <td className="px-6 py-3 text-foreground">
                        {schedule.reportName}
                      </td>
                      <td className="px-6 py-3 text-muted">
                        {humanCron(schedule.cron)}
                      </td>
                      <td className="px-6 py-3 text-xs text-muted">
                        {schedule.nextRunAt
                          ? formatDate(schedule.nextRunAt)
                          : "\u2014"}
                      </td>
                      <td className="px-6 py-3 text-xs text-muted">
                        <div className="flex items-center gap-2">
                          {schedule.lastRunAt
                            ? formatDate(schedule.lastRunAt)
                            : "\u2014"}
                          {schedule.lastRunStatus && (
                            <Badge
                              variant={
                                schedule.lastRunStatus === "success"
                                  ? "success"
                                  : "danger"
                              }
                            >
                              {schedule.lastRunStatus === "success"
                                ? "OK"
                                : "Erro"}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-3 text-center">
                        <button
                          onClick={() => handleToggle(schedule)}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${
                            schedule.enabled ? "bg-primary" : "bg-[#333]"
                          }`}
                        >
                          <span
                            className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                              schedule.enabled
                                ? "translate-x-4.5"
                                : "translate-x-0.5"
                            }`}
                          />
                        </button>
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleTrigger(schedule.id)}
                          >
                            <Play className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(schedule.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-danger" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
