'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/stores/auth';
import { formatMoney, formatNumber } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader, Spinner, StatCard } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

interface DayClose {
  date: string;
  salesCount: number;
  voidCount: number;
  grossTotal: number;
  taxTotal: number;
  discountTotal: number;
  returnsCount: number;
  returnsTotal: number;
  netTotal: number;
  byPaymentMethod: { method: string; count: number; total: number }[];
  byCurrency: { currency: string; count: number; tendered: number; inBase: number }[];
}

export default function DayClosePage() {
  const { t, locale } = useI18n();
  const { tenant } = useAuth();
  const currency = tenant?.currency ?? 'ILS';
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [branchId, setBranchId] = useState('');

  const branches = useQuery({
    queryKey: ['branches'],
    queryFn: () => api<{ id: string; name: string }[]>('/branches'),
  });

  const data = useQuery({
    queryKey: ['day-close', date, branchId],
    queryFn: () =>
      api<DayClose>('/sales/day-close', { query: { date, branchId } }),
  });

  const methodLabel: Record<string, string> = {
    CASH: t('pos.cash'),
    CREDIT_CARD: t('pos.card'),
    BANK_TRANSFER: t('pos.bankTransfer'),
    DIGITAL_WALLET: t('pos.wallet'),
  };

  return (
    <div>
      <PageHeader title={t('dayClose.title')}>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <Select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="w-44">
          <option value="">{t('common.allBranches')}</option>
          {branches.data?.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </Select>
        <Button
          variant="outline"
          onClick={() => {
            document.documentElement.classList.add('print-receipt');
            window.print();
            document.documentElement.classList.remove('print-receipt');
          }}
        >
          <Printer className="h-4 w-4" />
          {t('common.print')}
        </Button>
      </PageHeader>

      {data.isLoading || !data.data ? (
        <Spinner />
      ) : (
        <div id="receipt" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label={t('dayClose.netTotal')} value={formatMoney(data.data.netTotal, currency, locale)} tone="success" />
            <StatCard label={t('dayClose.grossTotal')} value={formatMoney(data.data.grossTotal, currency, locale)} />
            <StatCard label={t('dayClose.returns')} value={formatMoney(data.data.returnsTotal, currency, locale)} tone={data.data.returnsTotal > 0 ? 'warning' : 'default'} />
            <StatCard label={t('dayClose.salesCount')} value={formatNumber(data.data.salesCount, locale)} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t('dayClose.byMethod')}</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <THead>
                    <TR>
                      <TH>{t('pos.paymentMethod')}</TH>
                      <TH className="text-end">{t('dayClose.count')}</TH>
                      <TH className="text-end">{t('common.total')}</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {data.data.byPaymentMethod.map((row) => (
                      <TR key={row.method}>
                        <TD>{methodLabel[row.method] ?? row.method}</TD>
                        <TD className="num text-end">{row.count}</TD>
                        <TD className="num text-end font-medium">
                          {formatMoney(row.total, currency, locale)}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('dayClose.byCurrency')}</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <THead>
                    <TR>
                      <TH>{t('pos.payCurrency')}</TH>
                      <TH className="text-end">{t('dayClose.count')}</TH>
                      <TH className="text-end">{t('dayClose.tendered')}</TH>
                      <TH className="text-end">{t('dayClose.inBase', { base: currency })}</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {data.data.byCurrency.map((row) => (
                      <TR key={row.currency}>
                        <TD className="font-medium">{row.currency}</TD>
                        <TD className="num text-end">{row.count}</TD>
                        <TD className="num text-end">
                          {formatMoney(row.tendered, row.currency, locale)}
                        </TD>
                        <TD className="num text-end font-medium">
                          {formatMoney(row.inBase, currency, locale)}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="grid gap-2 pt-4 text-sm sm:grid-cols-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('common.tax')}</span>
                <span className="num">{formatMoney(data.data.taxTotal, currency, locale)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('common.discount')}</span>
                <span className="num">{formatMoney(data.data.discountTotal, currency, locale)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('dayClose.voids')}</span>
                <span className="num">{formatNumber(data.data.voidCount, locale)}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
