"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Schedule, ScheduleRun } from "@/lib/types";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatRelativeDate } from "@/lib/utils";
import Link from "next/link";
import {
  CalendarClock,
  Plus,
  Trash2,
  Play,
  Download,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";

export default function SchedulesPage() {
  const t = useTranslations("schedules");
  const tc = useTranslations("common");
  const locale = useLocale();
  const fullLocale = locale === "pt" ? "pt-PT" : locale === "es" ? "es-ES" : "en-US";

  function cronToLabel(cron: string): string {
    const parts = cron.trim().split(/\s+/);
    if (parts.length < 5) return cron;
    const [min, hour, dom, , dow] = parts;
    const dayNames = t("dayNames").split(",");
    if (dom !== "*" && /^\d+$/.test(dom)) {
      return t("cronMonthly", { day: dom, hour, minute: min.padStart(2, "0") });
    }
    if (dow !== "*" && /^\d+$/.test(dow)) {
      return t("cronWeekly", { day: dayNames[parseInt(dow)], hour, minute: min.padStart(2, "0") });
    }
    if (/^\d+$/.test(hour)) {
      return t("cronDaily", { hour, minute: min.padStart(2, "0") });
    }
    return cron;
  }

  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [runs, setRuns] = useState<Record<string, ScheduleRun[]>>({});
  const [loadingRuns, setLoadingRuns] = useState<string | null>(null);
  const [triggeringId, setTriggeringId] = useState<string | null>(null);

  useEffect(() => {
    api
      .getSchedules()
      .then(setSchedules)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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
    if (!confirm(t("confirmDelete"))) return;
    try {
      await api.deleteSchedule(id);
      setSchedules((prev) => prev.filter((s) => s.id !== id));
    } catch {
      // Ignore
    }
  };

  const handleTrigger = async (id: string) => {
    setTriggeringId(id);
    try {
      await api.triggerSchedule(id);
    } catch {
      // Ignore
    } finally {
      setTriggeringId(null);
    }
  };

  const toggleHistory = async (scheduleId: string) => {
    if (expandedId === scheduleId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(scheduleId);
    if (!runs[scheduleId]) {
      setLoadingRuns(scheduleId);
      try {
        const data = await api.getScheduleRuns(scheduleId);
        setRuns((prev) => ({ ...prev, [scheduleId]: data }));
      } catch {
        setRuns((prev) => ({ ...prev, [scheduleId]: [] }));
      } finally {
        setLoadingRuns(null);
      }
    }
  };

  const statusBadge = (status: ScheduleRun["status"]) => {
    const map: Record<ScheduleRun["status"], { variant: "success" | "danger" | "warning" | "muted" | "primary"; label: string }> = {
      completed: { variant: "success", label: t("runStatusCompleted") },
      failed: { variant: "danger", label: t("runStatusFailed") },
      running: { variant: "primary", label: t("runStatusRunning") },
      queued: { variant: "warning", label: t("runStatusQueued") },
      pending: { variant: "muted", label: t("runStatusPending") },
    };
    const { variant, label } = map[status] || { variant: "muted" as const, label: status };
    return <Badge variant={variant} dot>{label}</Badge>;
  };

  return (
    <div>
      <Topbar title={t("title")} />

      <div className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
          <p className="text-sm text-muted">
            {t("count", { count: schedules.length })}
          </p>
          <Link href={`/${locale}/schedules/new`}>
            <Button variant="primary" size="sm">
              <Plus className="h-3.5 w-3.5" />
              {t("newSchedule")}
            </Button>
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted">
            <p className="text-sm">{tc("loading")}</p>
          </div>
        ) : schedules.length === 0 ? (
          <Card>
            <div className="flex flex-col items-center justify-center py-16 text-muted">
              <CalendarClock className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm">
                {t("emptyTitle")}
              </p>
              <Link href={`/${locale}/schedules/new`} className="mt-3">
                <Button variant="primary" size="sm">
                  <Plus className="h-3.5 w-3.5" />
                  {t("newSchedule")}
                </Button>
              </Link>
            </div>
          </Card>
        ) : (
          <div className="space-y-4">
            {schedules.map((schedule) => (
              <Card key={schedule.id}>
                <CardContent className="py-5">
                  {/* Header row */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-foreground truncate">
                          {schedule.reportName}
                        </h3>
                        <Badge
                          variant={schedule.enabled ? "success" : "muted"}
                          dot
                        >
                          {schedule.enabled ? t("active") : t("paused")}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted mt-1">
                        {cronToLabel(schedule.cron)} &middot; {schedule.timezone}
                      </p>
                    </div>

                    {/* Toggle switch */}
                    <button
                      onClick={() => handleToggle(schedule)}
                      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors cursor-pointer ${
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
                  </div>

                  {/* Info row */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 text-xs text-muted mb-4">
                    <span>
                      {t("nextRun", {
                        time: schedule.nextRunAt
                          ? formatRelativeDate(schedule.nextRunAt, fullLocale)
                          : "\u2014",
                      })}
                    </span>
                    <span className="flex items-center gap-1.5">
                      {t("lastRun", {
                        time: schedule.lastRunAt
                          ? formatRelativeDate(schedule.lastRunAt, fullLocale)
                          : "\u2014",
                      })}
                      {schedule.lastRunStatus && (
                        <Badge
                          variant={
                            schedule.lastRunStatus === "success"
                              ? "success"
                              : "danger"
                          }
                        >
                          {schedule.lastRunStatus === "success" ? "OK" : tc("error")}
                        </Badge>
                      )}
                    </span>
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleTrigger(schedule.id)}
                      disabled={triggeringId === schedule.id}
                    >
                      <Play className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">{t("runNow")}</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleHistory(schedule.id)}
                    >
                      {expandedId === schedule.id ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                      {expandedId === schedule.id
                        ? t("hideHistory")
                        : t("showHistory")}
                    </Button>
                    <div className="flex-1" />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(schedule.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-danger" />
                    </Button>
                  </div>

                  {/* Run history */}
                  {expandedId === schedule.id && (
                    <div className="mt-4 border-t border-card-border pt-4">
                      <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
                        {t("runHistoryTitle")}
                      </h4>
                      {loadingRuns === schedule.id ? (
                        <p className="text-xs text-muted">{t("runHistoryLoading")}</p>
                      ) : (runs[schedule.id] || []).length === 0 ? (
                        <p className="text-xs text-muted">
                          {t("runHistoryEmpty")}
                        </p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-card-border/50">
                                <th className="py-2 pr-4 text-left text-xs font-medium text-muted">
                                  {t("runColumnStatus")}
                                </th>
                                <th className="py-2 pr-4 text-left text-xs font-medium text-muted">
                                  {t("runColumnStart")}
                                </th>
                                <th className="py-2 pr-4 text-left text-xs font-medium text-muted">
                                  {t("runColumnEnd")}
                                </th>
                                <th className="py-2 text-right text-xs font-medium text-muted">
                                  {t("runColumnFile")}
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-card-border/30">
                              {(runs[schedule.id] || []).map((run) => (
                                <tr key={run.id}>
                                  <td className="py-2 pr-4">
                                    {statusBadge(run.status)}
                                  </td>
                                  <td className="py-2 pr-4 text-xs text-muted">
                                    {formatDate(run.startedAt, fullLocale)}
                                  </td>
                                  <td className="py-2 pr-4 text-xs text-muted">
                                    {run.completedAt
                                      ? formatDate(run.completedAt, fullLocale)
                                      : "\u2014"}
                                  </td>
                                  <td className="py-2 text-right">
                                    {run.outputUrl ? (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() =>
                                          api.downloadScheduleRun(
                                            schedule.id,
                                            run.id
                                          )
                                        }
                                      >
                                        <Download className="h-3.5 w-3.5" />
                                      </Button>
                                    ) : run.errorMessage ? (
                                      <span
                                        className="text-xs text-danger cursor-help"
                                        title={run.errorMessage}
                                      >
                                        {tc("error")}
                                      </span>
                                    ) : (
                                      <span className="text-xs text-muted">
                                        &mdash;
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
