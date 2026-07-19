'use client';

import { type ReactNode } from 'react';
import { Loader2, PackageOpen } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { Button } from './button';
import { cn } from '@/lib/utils';

export function Spinner({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center justify-center py-10', className)}>
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

export function EmptyState({ message }: { message?: string }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
      <PackageOpen className="h-8 w-8" />
      <p className="text-sm">{message ?? t('common.noData')}</p>
    </div>
  );
}

export function PageHeader({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-bold">{title}</h1>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function Pagination({
  page,
  pageCount,
  onChange,
}: {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
}) {
  const { t } = useI18n();
  if (pageCount <= 1) return null;
  return (
    <div className="mt-3 flex items-center justify-end gap-2 text-sm">
      <span className="text-muted-foreground">
        {t('common.page')} {page} {t('common.of')} {pageCount}
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        {t('common.previous')}
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={page >= pageCount}
        onClick={() => onChange(page + 1)}
      >
        {t('common.next')}
      </Button>
    </div>
  );
}

export function ErrorText({ error }: { error: unknown }) {
  if (!error) return null;
  const message =
    error instanceof Error ? error.message : 'Something went wrong';
  return (
    <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </p>
  );
}

export function StatCard({
  label,
  value,
  icon,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  tone?: 'default' | 'success' | 'warning' | 'destructive';
}) {
  const tones: Record<string, string> = {
    default: 'text-primary bg-primary/10',
    success: 'text-emerald-600 bg-emerald-500/10',
    warning: 'text-amber-600 bg-amber-500/10',
    destructive: 'text-destructive bg-destructive/10',
  };
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        {icon ? (
          <span className={cn('rounded-md p-1.5', tones[tone])}>{icon}</span>
        ) : null}
      </div>
      <p className="num mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}
