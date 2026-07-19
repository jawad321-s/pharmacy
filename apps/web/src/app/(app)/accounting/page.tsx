'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/stores/auth';
import { cn, formatDate, formatMoney } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState, ErrorText, PageHeader, Pagination, Spinner } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

const EXPENSE_CATEGORIES = ['SALARIES', 'RENT', 'UTILITIES', 'MAINTENANCE', 'MARKETING', 'MISCELLANEOUS'];

type Tab = 'expenses' | 'pnl' | 'cashflow' | 'ledger';

interface Expense {
  id: string;
  category: string;
  amount: string;
  description: string | null;
  date: string;
  user: { firstName: string; lastName: string } | null;
  branch: { name: string } | null;
}

interface Pnl {
  grossRevenue: number;
  taxCollected: number;
  returns: number;
  netRevenue: number;
  costOfGoodsSold: number;
  grossProfit: number;
  expenses: { category: string; amount: number }[];
  totalExpenses: number;
  netProfit: number;
}

interface CashFlow {
  totalInflow: number;
  totalOutflow: number;
  netCashFlow: number;
  days: { date: string; inflow: number; outflow: number; net: number; balance: number }[];
}

interface LedgerEntry {
  id: string;
  date: string;
  account: string;
  side: string;
  amount: string;
  description: string;
}

function monthStart(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function AccountingPage() {
  const { t, locale } = useI18n();
  const { tenant, hasPermission } = useAuth();
  const currency = tenant?.currency ?? 'SAR';
  const queryClient = useQueryClient();
  const canManage = hasPermission('accounting.manage');

  const [tab, setTab] = useState<Tab>('expenses');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [page, setPage] = useState(1);
  const [showExpense, setShowExpense] = useState(false);
  const [expenseCategory, setExpenseCategory] = useState('RENT');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expenseDate, setExpenseDate] = useState(today());

  const expenses = useQuery({
    queryKey: ['expenses', from, to, page],
    queryFn: () =>
      api<{ data: Expense[]; meta: { pageCount: number }; totalAmount: number }>(
        '/accounting/expenses',
        { query: { from, to, page, pageSize: 15 } },
      ),
    enabled: tab === 'expenses',
  });

  const pnl = useQuery({
    queryKey: ['pnl', from, to],
    queryFn: () => api<Pnl>('/accounting/profit-loss', { query: { from, to } }),
    enabled: tab === 'pnl',
  });

  const cashflow = useQuery({
    queryKey: ['cashflow', from, to],
    queryFn: () => api<CashFlow>('/accounting/cash-flow', { query: { from, to } }),
    enabled: tab === 'cashflow',
  });

  const ledger = useQuery({
    queryKey: ['ledger', from, to, page],
    queryFn: () =>
      api<{ data: LedgerEntry[]; meta: { pageCount: number } }>('/accounting/ledger', {
        query: { from, to, page, pageSize: 20 },
      }),
    enabled: tab === 'ledger',
  });

  const createExpense = useMutation({
    mutationFn: () =>
      api('/accounting/expenses', {
        method: 'POST',
        body: {
          category: expenseCategory,
          amount: Number(expenseAmount),
          description: expenseDescription || undefined,
          date: expenseDate,
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['expenses'] });
      setShowExpense(false);
      setExpenseAmount('');
      setExpenseDescription('');
    },
  });

  const removeExpense = useMutation({
    mutationFn: (id: string) => api(`/accounting/expenses/${id}`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['expenses'] }),
  });

  const tabs: { key: Tab; label: string }[] = [
    { key: 'expenses', label: t('accounting.expenses') },
    { key: 'pnl', label: t('accounting.profitLoss') },
    { key: 'cashflow', label: t('accounting.cashFlow') },
    { key: 'ledger', label: t('accounting.ledger') },
  ];

  return (
    <div>
      <PageHeader title={t('accounting.title')}>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-38" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-38" />
        {canManage ? (
          <Button onClick={() => setShowExpense(true)}>
            <Plus className="h-4 w-4" />
            {t('accounting.addExpense')}
          </Button>
        ) : null}
      </PageHeader>

      <div className="mb-4 flex gap-1 overflow-x-auto border-b">
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => { setTab(item.key); setPage(1); }}
            className={cn(
              'whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium',
              tab === item.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'expenses' ? (
        expenses.isLoading ? (
          <Spinner />
        ) : !expenses.data?.data.length ? (
          <EmptyState />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>{t('common.date')}</TH>
                  <TH>{t('accounting.category')}</TH>
                  <TH>{t('medicines.description')}</TH>
                  <TH>{t('audit.user')}</TH>
                  <TH className="text-end">{t('common.amount')}</TH>
                  <TH className="text-end">{t('common.actions')}</TH>
                </TR>
              </THead>
              <TBody>
                {expenses.data.data.map((expense) => (
                  <TR key={expense.id}>
                    <TD>{formatDate(expense.date, locale)}</TD>
                    <TD>{t(`accounting.${expense.category}`)}</TD>
                    <TD>{expense.description ?? '—'}</TD>
                    <TD className="text-xs">
                      {expense.user ? `${expense.user.firstName} ${expense.user.lastName}` : '—'}
                    </TD>
                    <TD className="num text-end font-medium">
                      {formatMoney(expense.amount, currency, locale)}
                    </TD>
                    <TD className="text-end">
                      {canManage ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (window.confirm(t('common.delete') + '?')) {
                              removeExpense.mutate(expense.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      ) : null}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <div className="mt-2 flex items-center justify-between">
              <p className="text-sm">
                {t('accounting.totalExpenses')}:{' '}
                <span className="num font-bold">
                  {formatMoney(expenses.data.totalAmount, currency, locale)}
                </span>
              </p>
              <Pagination page={page} pageCount={expenses.data.meta.pageCount} onChange={setPage} />
            </div>
          </>
        )
      ) : null}

      {tab === 'pnl' ? (
        pnl.isLoading ? (
          <Spinner />
        ) : pnl.data ? (
          <div className="max-w-2xl rounded-lg border bg-card">
            {[
              { label: t('accounting.grossRevenue'), value: pnl.data.grossRevenue },
              { label: t('common.tax'), value: -pnl.data.taxCollected },
              { label: t('purchases.return'), value: -pnl.data.returns },
              { label: t('accounting.netRevenue'), value: pnl.data.netRevenue, bold: true },
              { label: t('accounting.cogs'), value: -pnl.data.costOfGoodsSold },
              { label: t('accounting.grossProfit'), value: pnl.data.grossProfit, bold: true },
              ...pnl.data.expenses
                .filter((expense) => expense.amount > 0)
                .map((expense) => ({
                  label: `${t('accounting.expenses')} — ${t(`accounting.${expense.category}`)}`,
                  value: -expense.amount,
                  bold: false,
                })),
              { label: t('accounting.totalExpenses'), value: -pnl.data.totalExpenses, bold: true },
            ].map((row, index) => (
              <div
                key={index}
                className={cn(
                  'flex items-center justify-between border-b px-4 py-2.5 text-sm',
                  row.bold && 'font-semibold',
                )}
              >
                <span>{row.label}</span>
                <span className={cn('num', row.value < 0 && 'text-destructive')}>
                  {formatMoney(row.value, currency, locale)}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between px-4 py-3 text-base font-bold">
              <span>{t('accounting.netProfit')}</span>
              <span className={cn('num', pnl.data.netProfit >= 0 ? 'text-emerald-600' : 'text-destructive')}>
                {formatMoney(pnl.data.netProfit, currency, locale)}
              </span>
            </div>
          </div>
        ) : null
      ) : null}

      {tab === 'cashflow' ? (
        cashflow.isLoading ? (
          <Spinner />
        ) : cashflow.data ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border bg-card p-4">
                <p className="text-xs uppercase text-muted-foreground">{t('accounting.inflow')}</p>
                <p className="num mt-1 text-xl font-bold text-emerald-600">
                  {formatMoney(cashflow.data.totalInflow, currency, locale)}
                </p>
              </div>
              <div className="rounded-lg border bg-card p-4">
                <p className="text-xs uppercase text-muted-foreground">{t('accounting.outflow')}</p>
                <p className="num mt-1 text-xl font-bold text-destructive">
                  {formatMoney(cashflow.data.totalOutflow, currency, locale)}
                </p>
              </div>
              <div className="rounded-lg border bg-card p-4">
                <p className="text-xs uppercase text-muted-foreground">{t('accounting.cashFlow')}</p>
                <p className="num mt-1 text-xl font-bold">
                  {formatMoney(cashflow.data.netCashFlow, currency, locale)}
                </p>
              </div>
            </div>
            <Table>
              <THead>
                <TR>
                  <TH>{t('common.date')}</TH>
                  <TH className="text-end">{t('accounting.inflow')}</TH>
                  <TH className="text-end">{t('accounting.outflow')}</TH>
                  <TH className="text-end">{t('purchases.balance')}</TH>
                </TR>
              </THead>
              <TBody>
                {cashflow.data.days.map((day) => (
                  <TR key={day.date}>
                    <TD>{formatDate(day.date, locale)}</TD>
                    <TD className="num text-end text-emerald-600">{formatMoney(day.inflow, currency, locale)}</TD>
                    <TD className="num text-end text-destructive">{formatMoney(day.outflow, currency, locale)}</TD>
                    <TD className="num text-end font-medium">{formatMoney(day.balance, currency, locale)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        ) : null
      ) : null}

      {tab === 'ledger' ? (
        ledger.isLoading ? (
          <Spinner />
        ) : !ledger.data?.data.length ? (
          <EmptyState />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>{t('common.date')}</TH>
                  <TH>{t('accounting.account')}</TH>
                  <TH>{t('medicines.description')}</TH>
                  <TH>{t('accounting.side')}</TH>
                  <TH className="text-end">{t('common.amount')}</TH>
                </TR>
              </THead>
              <TBody>
                {ledger.data.data.map((entry) => (
                  <TR key={entry.id}>
                    <TD>{formatDate(entry.date, locale)}</TD>
                    <TD className="text-xs font-medium">{entry.account}</TD>
                    <TD className="text-xs">{entry.description}</TD>
                    <TD>
                      <span className={cn('text-xs font-semibold', entry.side === 'DEBIT' ? 'text-emerald-600' : 'text-destructive')}>
                        {entry.side}
                      </span>
                    </TD>
                    <TD className="num text-end">{formatMoney(entry.amount, currency, locale)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination page={page} pageCount={ledger.data.meta.pageCount} onChange={setPage} />
          </>
        )
      ) : null}

      <Dialog open={showExpense} onClose={() => setShowExpense(false)} title={t('accounting.addExpense')}>
        <div className="space-y-3">
          <ErrorText error={createExpense.error} />
          <Field label={t('accounting.category')}>
            <Select value={expenseCategory} onChange={(e) => setExpenseCategory(e.target.value)}>
              {EXPENSE_CATEGORIES.map((category) => (
                <option key={category} value={category}>{t(`accounting.${category}`)}</option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('common.amount')}>
              <Input type="number" min={0.01} step="0.01" value={expenseAmount} onChange={(e) => setExpenseAmount(e.target.value)} />
            </Field>
            <Field label={t('common.date')}>
              <Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
            </Field>
          </div>
          <Field label={t('medicines.description')}>
            <Textarea value={expenseDescription} onChange={(e) => setExpenseDescription(e.target.value)} />
          </Field>
          <Button
            className="w-full"
            loading={createExpense.isPending}
            disabled={!expenseAmount || Number(expenseAmount) <= 0}
            onClick={() => createExpense.mutate()}
          >
            {t('common.save')}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
