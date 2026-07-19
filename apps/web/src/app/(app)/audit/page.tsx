'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { formatDate } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { EmptyState, PageHeader, Pagination, Spinner } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

interface AuditRow {
  id: string;
  action: string;
  resource: string;
  resourceId: string | null;
  oldValue: unknown;
  newValue: unknown;
  ip: string | null;
  createdAt: string;
  user: { firstName: string; lastName: string; email: string } | null;
}

export default function AuditPage() {
  const { t, locale } = useI18n();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);

  const logs = useQuery({
    queryKey: ['audit', search, page],
    queryFn: () =>
      api<{ data: AuditRow[]; meta: { pageCount: number } }>('/audit', {
        query: { search, page, pageSize: 20 },
      }),
  });

  return (
    <div>
      <PageHeader title={t('audit.title')}>
        <Input
          placeholder={t('common.search')}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-56"
        />
      </PageHeader>

      {logs.isLoading ? (
        <Spinner />
      ) : !logs.data?.data.length ? (
        <EmptyState />
      ) : (
        <>
          <Table>
            <THead>
              <TR>
                <TH>{t('common.date')}</TH>
                <TH>{t('audit.user')}</TH>
                <TH>{t('audit.action')}</TH>
                <TH>{t('audit.resource')}</TH>
                <TH>{t('audit.ip')}</TH>
              </TR>
            </THead>
            <TBody>
              {logs.data.data.map((log) => (
                <TR
                  key={log.id}
                  className="cursor-pointer"
                  onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                >
                  <TD className="whitespace-nowrap text-xs">
                    {formatDate(log.createdAt, locale, true)}
                  </TD>
                  <TD className="text-xs">
                    {log.user ? `${log.user.firstName} ${log.user.lastName}` : '—'}
                  </TD>
                  <TD><Badge variant="muted">{log.action}</Badge></TD>
                  <TD className="text-xs">{log.resource}</TD>
                  <TD className="num text-xs">{log.ip ?? '—'}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {expanded ? (
            (() => {
              const log = logs.data.data.find((row) => row.id === expanded);
              if (!log) return null;
              return (
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg border bg-card p-3">
                    <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                      {t('audit.oldValue')}
                    </p>
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs" dir="ltr">
                      {log.oldValue ? JSON.stringify(log.oldValue, null, 2) : '—'}
                    </pre>
                  </div>
                  <div className="rounded-lg border bg-card p-3">
                    <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                      {t('audit.newValue')}
                    </p>
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs" dir="ltr">
                      {log.newValue ? JSON.stringify(log.newValue, null, 2) : '—'}
                    </pre>
                  </div>
                </div>
              );
            })()
          ) : null}
          <Pagination page={page} pageCount={logs.data.meta.pageCount} onChange={setPage} />
        </>
      )}
    </div>
  );
}
