'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileSpreadsheet, FileText } from 'lucide-react';
import { api, downloadFile } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { EmptyState, PageHeader, Spinner } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

const REPORT_TYPES = [
  'sales',
  'purchases',
  'inventory',
  'profit',
  'customers',
  'suppliers',
  'tax',
  'expiry',
  'branches',
] as const;

interface ReportData {
  title: string;
  subtitle?: string;
  columns: { key: string; header: string; numeric?: boolean }[];
  rows: Record<string, string | number | null>[];
  totals?: Record<string, string | number>;
}

function monthStart(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

export default function ReportsPage() {
  const { t } = useI18n();
  const [type, setType] = useState<(typeof REPORT_TYPES)[number]>('sales');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [branchId, setBranchId] = useState('');

  const branches = useQuery({
    queryKey: ['branches'],
    queryFn: () => api<{ id: string; name: string }[]>('/branches'),
  });

  const report = useQuery({
    queryKey: ['report', type, from, to, branchId],
    queryFn: () =>
      api<ReportData>(`/reports/${type}`, { query: { from, to, branchId } }),
  });

  const exportQuery = { from, to, branchId };

  return (
    <div>
      <PageHeader title={t('reports.title')}>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <Select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="w-40">
          <option value="">{t('common.allBranches')}</option>
          {branches.data?.map((branch) => (
            <option key={branch.id} value={branch.id}>{branch.name}</option>
          ))}
        </Select>
        <Button
          variant="outline"
          onClick={() => downloadFile(`/reports/${type}/excel`, `${type}-report.xlsx`, exportQuery)}
        >
          <FileSpreadsheet className="h-4 w-4" />
          {t('common.exportExcel')}
        </Button>
        <Button
          variant="outline"
          onClick={() => downloadFile(`/reports/${type}/pdf`, `${type}-report.pdf`, exportQuery)}
        >
          <FileText className="h-4 w-4" />
          {t('common.exportPdf')}
        </Button>
      </PageHeader>

      <div className="mb-4 flex flex-wrap gap-1">
        {REPORT_TYPES.map((reportType) => (
          <button
            key={reportType}
            type="button"
            onClick={() => setType(reportType)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-sm transition-colors',
              type === reportType
                ? 'border-primary bg-primary text-primary-foreground'
                : 'bg-card text-muted-foreground hover:text-foreground',
            )}
          >
            {t(`reports.${reportType}`)}
          </button>
        ))}
      </div>

      {report.isLoading ? (
        <Spinner />
      ) : !report.data ? (
        <EmptyState />
      ) : (
        <div>
          <div className="mb-2">
            <h2 className="font-semibold">{report.data.title}</h2>
            {report.data.subtitle ? (
              <p className="text-xs text-muted-foreground">{report.data.subtitle}</p>
            ) : null}
          </div>
          {report.data.rows.length === 0 ? (
            <EmptyState />
          ) : (
            <Table>
              <THead>
                <TR>
                  {report.data.columns.map((column) => (
                    <TH key={column.key} className={cn(column.numeric && 'text-end')}>
                      {column.header}
                    </TH>
                  ))}
                </TR>
              </THead>
              <TBody>
                {report.data.rows.map((row, index) => (
                  <TR key={index}>
                    {report.data!.columns.map((column) => (
                      <TD key={column.key} className={cn(column.numeric && 'num text-end')}>
                        {typeof row[column.key] === 'number'
                          ? (row[column.key] as number).toLocaleString(undefined, {
                              minimumFractionDigits: column.numeric ? 2 : 0,
                              maximumFractionDigits: 2,
                            })
                          : (row[column.key] ?? '—')}
                      </TD>
                    ))}
                  </TR>
                ))}
                {report.data.totals ? (
                  <TR className="bg-muted/50 font-semibold">
                    {report.data.columns.map((column) => (
                      <TD key={column.key} className={cn(column.numeric && 'num text-end')}>
                        {typeof report.data!.totals![column.key] === 'number'
                          ? (report.data!.totals![column.key] as number).toLocaleString(undefined, {
                              minimumFractionDigits: column.numeric ? 2 : 0,
                              maximumFractionDigits: 2,
                            })
                          : (report.data!.totals![column.key] ?? '')}
                      </TD>
                    ))}
                  </TR>
                ) : null}
              </TBody>
            </Table>
          )}
        </div>
      )}
    </div>
  );
}
