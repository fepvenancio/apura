import type { QueryColumn } from "./types";

function escapeValue(val: unknown): string {
  if (val == null) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function generateCsv(
  columns: QueryColumn[],
  rows: Record<string, unknown>[],
): string {
  const header = columns.map((c) => escapeValue(c.name)).join(",");
  const dataRows = rows.map((row) =>
    columns.map((col) => escapeValue(row[col.name])).join(","),
  );
  return [header, ...dataRows].join("\n");
}

export function downloadCsv(
  columns: QueryColumn[],
  rows: Record<string, unknown>[],
  filename: string,
): void {
  const csv = generateCsv(columns, rows);
  const bom = "\uFEFF";
  const blob = new Blob([bom + csv], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
