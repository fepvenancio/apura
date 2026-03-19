import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(value: number, locale: string = "pt-PT"): string {
  return new Intl.NumberFormat(locale).format(value);
}

export function formatCurrency(value: number, locale: string = "pt-PT"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

export function formatDate(date: string | Date | null | undefined, locale: string = "pt-PT"): string {
  if (!date) return "\u2014";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "\u2014";
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function formatRelativeDate(date: string | Date | null | undefined, locale: string = "pt-PT"): string {
  if (!date) return "\u2014";
  const now = new Date();
  const d = new Date(date);
  if (isNaN(d.getTime())) return "\u2014";
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  if (diffSec < 60) return rtf.format(-diffSec, "second");
  const diffMins = Math.floor(diffSec / 60);
  if (diffMins < 60) return rtf.format(-diffMins, "minute");
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return rtf.format(-diffHours, "hour");
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return rtf.format(-diffDays, "day");
  return formatDate(date, locale);
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
