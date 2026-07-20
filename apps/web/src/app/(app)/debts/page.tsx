'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { HandCoins, ReceiptText } from 'lucide-react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/stores/auth';
import { formatMoney, formatNumber } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState, PageHeader, Pagination, Spinner, StatCard } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { CustomerPaymentDialog } from '@/components/customer-payment-dialog';
import { CustomerStatementDialog } from '@/components/customer-statement-dialog';

interface Debtor {
  id: string;
  name: string;
  phone: string | null;
  balance: number;
}

interface DebtsResponse {
  data: Debtor[];
  meta: { pageCount: number };
  totalReceivable: number;
  debtorCount: number;
}

export default function DebtsPage() {
  const { t, locale } = useI18n();
  const { tenant, hasPermission } = useAuth();
  const currency = tenant?.currency ?? 'ILS';
  const canManage = hasPermission('customers.manage');

  const [page, setPage] = useState(1);
  const [payTarget, setPayTarget] = useState<Debtor | null>(null);
  const [stmtTarget, setStmtTarget] = useState<Debtor | null>(null);

  const debts = useQuery({
    queryKey: ['debts', page],
    queryFn: () =>
      api<DebtsResponse>('/customers/debts', { query: { page, pageSize: 15 } }),
  });

  return (
    <div>
      <PageHeader title={t('debts.title')} />

      {debts.isLoading || !debts.data ? (
        <Spinner />
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <StatCard
              label={t('debts.totalReceivable')}
              value={formatMoney(debts.data.totalReceivable, currency, locale)}
              tone={debts.data.totalReceivable > 0 ? 'warning' : 'success'}
            />
            <StatCard
              label={t('debts.debtorCount')}
              value={formatNumber(debts.data.debtorCount, locale)}
            />
          </div>

          {debts.data.data.length === 0 ? (
            <EmptyState message={t('debts.empty')} />
          ) : (
            <>
              <Table>
                <THead>
                  <TR>
                    <TH>{t('debts.customer')}</TH>
                    <TH>{t('common.phone')}</TH>
                    <TH className="text-end">{t('debts.balance')}</TH>
                    <TH className="text-end">{t('common.actions')}</TH>
                  </TR>
                </THead>
                <TBody>
                  {debts.data.data.map((debtor) => (
                    <TR key={debtor.id}>
                      <TD className="font-medium">{debtor.name}</TD>
                      <TD className="num" dir="ltr">{debtor.phone ?? '—'}</TD>
                      <TD className="text-end">
                        <Badge variant="warning">
                          {formatMoney(debtor.balance, currency, locale)}
                        </Badge>
                      </TD>
                      <TD>
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setStmtTarget(debtor)}
                          >
                            <ReceiptText className="h-4 w-4" />
                            {t('customers.statement')}
                          </Button>
                          {canManage ? (
                            <Button size="sm" onClick={() => setPayTarget(debtor)}>
                              <HandCoins className="h-4 w-4" />
                              {t('debts.collect')}
                            </Button>
                          ) : null}
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              <Pagination
                page={page}
                pageCount={debts.data.meta.pageCount}
                onChange={setPage}
              />
            </>
          )}
        </>
      )}

      <CustomerPaymentDialog customer={payTarget} onClose={() => setPayTarget(null)} />
      <CustomerStatementDialog
        customerId={stmtTarget?.id ?? null}
        customerName={stmtTarget?.name ?? ''}
        onClose={() => setStmtTarget(null)}
      />
    </div>
  );
}
