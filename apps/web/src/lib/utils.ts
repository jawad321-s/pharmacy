import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatMoney(
  value: number | string | null | undefined,
  currency = 'SAR',
  locale = 'en',
): string {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-SA' : 'en-US', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatNumber(value: number | string | null | undefined, locale = 'en'): string {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-SA' : 'en-US').format(
    Number(value ?? 0),
  );
}

export function formatDate(
  value: string | Date | null | undefined,
  locale = 'en',
  withTime = false,
): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA' : 'en-GB', {
    dateStyle: 'medium',
    ...(withTime ? { timeStyle: 'short' } : {}),
  }).format(date);
}

export function daysUntil(value: string | Date): number {
  const date = typeof value === 'string' ? new Date(value) : value;
  return Math.ceil((date.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}
