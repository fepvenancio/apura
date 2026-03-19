"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import ReactEChartsCore from "echarts-for-react/lib/core";
import * as echarts from "echarts/core";
import { BarChart, LineChart, PieChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { QueryResult } from "@/lib/types";
import { cn, isDateColumn } from "@/lib/utils";
import { BarChart3, LineChart as LineChartIcon, PieChart as PieChartIcon, AreaChart } from "lucide-react";

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  CanvasRenderer,
]);

type ChartType = "bar" | "line" | "pie" | "area";

interface ResultChartProps {
  result: QueryResult;
}

function detectChartType(result: QueryResult): ChartType | null {
  const { columns, rows } = result;
  if (columns.length < 2 || rows.length === 0) return null;

  const textCols = columns.filter(
    (c) => c.type === "string" || c.type === "text" || c.type === "varchar" || c.type === "nvarchar"
  );
  const numCols = columns.filter(
    (c) => c.type === "number" || c.type === "int" || c.type === "decimal" || c.type === "float" || c.type === "money" || c.type === "bigint"
  );

  // Check if first column has date-like values
  const firstColValues = rows.map((r) => r[columns[0].name]);
  const firstIsDate = isDateColumn(columns[0].name, firstColValues);

  if (firstIsDate && numCols.length >= 1) return "line";
  if (textCols.length === 1 && numCols.length === 1 && rows.length <= 8) return "pie";
  if (textCols.length >= 1 && numCols.length >= 1) return "bar";
  return "bar";
}

export function ResultChart({ result }: ResultChartProps) {
  const t = useTranslations("query");
  const autoType = detectChartType(result);
  const [chartType, setChartType] = useState<ChartType>(autoType || "bar");

  const option = useMemo(() => {
    const { columns, rows } = result;
    if (columns.length < 2 || rows.length === 0) return null;

    const categoryCol = columns[0];
    const valueCols = columns.slice(1).filter((c) => {
      const sample = rows.find((r) => r[c.name] != null)?.[c.name];
      return typeof sample === "number";
    });

    if (valueCols.length === 0) return null;

    const categories = rows.map((r) => String(r[categoryCol.name] ?? ""));

    const baseStyle = {
      backgroundColor: "transparent",
      textStyle: { color: "#a3a3a3" },
      tooltip: {
        trigger: chartType === "pie" ? "item" : "axis",
        backgroundColor: "#1a1a1a",
        borderColor: "#333",
        textStyle: { color: "#fafafa" },
      },
    };

    if (chartType === "pie") {
      const valueCol = valueCols[0];
      return {
        ...baseStyle,
        series: [
          {
            type: "pie",
            radius: ["35%", "65%"],
            data: rows.map((r) => ({
              name: String(r[categoryCol.name] ?? ""),
              value: r[valueCol.name],
            })),
            label: { color: "#a3a3a3", fontSize: 11 },
            emphasis: {
              itemStyle: {
                shadowBlur: 10,
                shadowOffsetX: 0,
                shadowColor: "rgba(0, 0, 0, 0.5)",
              },
            },
          },
        ],
        color: ["#3B82F6", "#60A5FA", "#93C5FD", "#2563EB", "#1D4ED8", "#BFDBFE", "#1E40AF", "#DBEAFE"],
      };
    }

    return {
      ...baseStyle,
      grid: { left: "8%", right: "4%", bottom: "12%", top: "8%", containLabel: true },
      xAxis: {
        type: "category",
        data: categories,
        axisLabel: { color: "#737373", fontSize: 11, rotate: categories.length > 10 ? 45 : 0 },
        axisLine: { lineStyle: { color: "#333" } },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: "#737373", fontSize: 11 },
        splitLine: { lineStyle: { color: "#222" } },
        axisLine: { lineStyle: { color: "#333" } },
      },
      series: valueCols.map((vc, i) => ({
        name: vc.name,
        type: chartType === "area" ? "line" : chartType,
        data: rows.map((r) => r[vc.name]),
        ...(chartType === "area" ? { areaStyle: { opacity: 0.15 } } : {}),
        itemStyle: {
          color: ["#3B82F6", "#60A5FA", "#93C5FD", "#2563EB"][i % 4],
        },
        barMaxWidth: 40,
        smooth: chartType === "line" || chartType === "area",
      })),
      legend:
        valueCols.length > 1
          ? { show: true, textStyle: { color: "#a3a3a3" }, bottom: 0 }
          : { show: false },
      color: ["#3B82F6", "#60A5FA", "#93C5FD", "#2563EB"],
    };
  }, [result, chartType]);

  if (!option) {
    return (
      <div className="flex items-center justify-center py-12 text-muted">
        <p className="text-sm">{t("insufficientData")}</p>
      </div>
    );
  }

  const chartButtons: { type: ChartType; icon: typeof BarChart3; label: string }[] = [
    { type: "bar", icon: BarChart3, label: t("chartBar") },
    { type: "line", icon: LineChartIcon, label: t("chartLine") },
    { type: "pie", icon: PieChartIcon, label: t("chartPie") },
    { type: "area", icon: AreaChart, label: t("chartArea") },
  ];

  return (
    <div className="w-full">
      {/* Chart type switcher */}
      <div className="flex gap-1 mb-4">
        {chartButtons.map((btn) => (
          <button
            key={btn.type}
            onClick={() => setChartType(btn.type)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
              chartType === btn.type
                ? "bg-primary/10 text-primary"
                : "text-muted hover:text-foreground hover:bg-[#1a1a1a]"
            )}
          >
            <btn.icon className="h-3.5 w-3.5" />
            {btn.label}
          </button>
        ))}
      </div>

      <ReactEChartsCore
        echarts={echarts}
        option={option}
        style={{ height: "400px", width: "100%" }}
        notMerge
        lazyUpdate
      />
    </div>
  );
}
