'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/stores/auth';
import { cn, formatDate, formatMoney } from '@/lib/utils';
import { Dialog } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { EmptyState, Spinner } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

interface StatementEntry {
  date: string;
  type: 'CREDIT_SALE' | 'PAYMENT';
  reference: string;
  debit: number;
  credit: number;
  balance: number;
  note: string | null;
}

interface Statement {
  openingBalance: number;
  balance: number;
  entries: StatementEntry[];
}

export function CustomerStatementDialog({
  customerId,
  customerName,
  onClose,
}: {
  customerId: string | null;
  customerName: string;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const { tenant } = useAuth();
  const currency = tenant?.currency ?? 'ILS';

  const statement = useQuery({
    queryKey: ['customer-statement', customerId],
    queryFn: () => api<Statement>(`/customers/${customerId}/statement`),
    enabled: Boolean(customerId),
  });

  return (
    <Dialog
      open={Boolean(customerId)}
      onClose={onClose}
      title={`${t('customers.statement')} — ${customerName}`}
      wide
    >
      {statement.isLoading ? (
        <Spinner />
      ) : !statement.data?.entries.length ? (
        <EmptyState message={t('customers.noDebt')} />
      ) : (
        <div className="space-y-3">
          <Table>
            <THead>
              <TR>
                <TH>{t('common.date')}</TH>
                <TH>{t('audit.action')}</TH>
                <TH>#</TH>
                <TH className="text-end">{t('customers.debit')}</TH>
                <TH className="text-end">{t('customers.credit')}</TH>
                <TH className="text-end">{t('customers.balance')}</TH>
              </TR>
            </THead>
            <TBody>
              {statement.data.entries.map((entry, index) => (
                <TR key={index}>
                  <TD className="whitespace-nowrap text-xs">
                    {formatDate(entry.date, locale, true)}
                  </TD>
                  <TD>
                    <Badge variant={entry.type === 'PAYMENT' ? 'success' : 'warning'}>
                      {entry.type === 'PAYMENT'
                        ? t('customers.payment')
                        : t('customers.creditSale')}
                    </Badge>
                  </TD>
                  <TD className="text-xs">{entry.reference}</TD>
                  <TD className="num text-end">
                    {entry.debit ? formatMoney(entry.debit, currency, locale) : '—'}
                  </TD>
                  <TD className="num text-end">
                    {entry.credit ? formatMoney(entry.credit, currency, locale) : '—'}
                  </TD>
                  <TD className="num text-end font-medium">
                    {formatMoney(entry.balance, currency, locale)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <p className="text-end text-sm">
            {t('customers.balance')}:{' '}
            <span
              className={cn(
                'num font-bold',
                statement.data.balance > 0 ? 'text-amber-600' : 'text-emerald-600',
              )}
            >
              {formatMoney(statement.data.balance, currency, locale)}
            </span>
          </p>
        </div>
      )}
    </Dialog>
  );
}
