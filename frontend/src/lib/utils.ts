import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("pt-PT").format(value);
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

export function formatRelativeDate(date: string | Date): string {
  const now = new Date();
  const d = new Date(date);
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "agora";
  if (diffMins < 60) return `${diffMins}min atrás`;
  if (diffHours < 24) return `${diffHours}h atrás`;
  if (diffDays < 7) return `${diffDays}d atrás`;
  return formatDate(date);
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isCurrencyColumn(name: string): boolean {
  const patterns = [
    /preco/i, /valor/i, /total/i, /montante/i, /custo/i,
    /price/i, /amount/i, /cost/i, /revenue/i, /saldo/i,
  ];
  return patterns.some((p) => p.test(name));
}

export function isDateColumn(name: string, values: unknown[]): boolean {
  const namePatterns = [/data/i, /date/i, /mes/i, /month/i, /ano/i, /year/i, /periodo/i];
  if (namePatterns.some((p) => p.test(name))) return true;
  if (values.length > 0) {
    const sample = String(values[0]);
    return /^\d{4}-\d{2}/.test(sample) || /^\d{2}\/\d{2}\/\d{4}/.test(sample);
  }
  return false;
}
