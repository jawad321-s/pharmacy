'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { HandCoins, History, Pencil, Plus, ReceiptText, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/stores/auth';
import { cn, formatDate, formatMoney, formatNumber } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Dialog } from '@/components/ui/dialog';
import { Badge, statusVariant } from '@/components/ui/badge';
import { EmptyState, ErrorText, PageHeader, Pagination, Spinner } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { CustomerPaymentDialog } from '@/components/customer-payment-dialog';
import { CustomerStatementDialog } from '@/components/customer-statement-dialog';

const schema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  openingBalance: z.coerce.number().min(0).optional(),
  creditLimit: z.coerce.number().min(0).optional(),
});
type FormValues = z.infer<typeof schema>;

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  loyaltyPoints: number;
  totalSpent: string;
  openingBalance: string;
  creditLimit: string;
  balance: number;
  isActive: boolean;
}

interface HistoryRow {
  id: string;
  number: string;
  total: string;
  status: string;
  createdAt: string;
  branch: { name: string };
  items: { id: string; quantity: number; medicine: { name: string; nameAr: string | null } }[];
}

export default function CustomersPage() {
  const { t, locale } = useI18n();
  const { tenant, hasPermission } = useAuth();
  const currency = tenant?.currency ?? 'ILS';
  const queryClient = useQueryClient();
  const canManage = hasPermission('customers.manage');

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [historyTarget, setHistoryTarget] = useState<Customer | null>(null);
  const [payTarget, setPayTarget] = useState<Customer | null>(null);
  const [stmtTarget, setStmtTarget] = useState<Customer | null>(null);

  const customers = useQuery({
    queryKey: ['customers', search, page],
    queryFn: () =>
      api<{ data: Customer[]; meta: { pageCount: number } }>('/customers', {
        query: { search, page, pageSize: 15 },
      }),
  });

  const history = useQuery({
    queryKey: ['customer-history', historyTarget?.id],
    queryFn: () =>
      api<{ data: HistoryRow[] }>(`/customers/${historyTarget!.id}/purchases`, {
        query: { pageSize: 20 },
      }),
    enabled: Boolean(historyTarget),
  });

  const form = useForm<FormValues>({ resolver: zodResolver(schema) });

  const save = useMutation({
    mutationFn: (values: FormValues) => {
      const body = { ...values, email: values.email || undefined };
      return editing
        ? api(`/customers/${editing.id}`, { method: 'PATCH', body })
        : api('/customers', { method: 'POST', body });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
      setShowForm(false);
      setEditing(null);
      form.reset();
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/customers/${id}`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['customers'] }),
  });

  return (
    <div>
      <PageHeader title={t('customers.title')}>
        <Input
          placeholder={t('common.search')}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-52"
        />
        {canManage ? (
          <Button onClick={() => { setEditing(null); form.reset({}); setShowForm(true); }}>
            <Plus className="h-4 w-4" />
            {t('customers.addCustomer')}
          </Button>
        ) : null}
      </PageHeader>

      {customers.isLoading ? (
        <Spinner />
      ) : !customers.data?.data.length ? (
        <EmptyState />
      ) : (
        <>
          <Table>
            <THead>
              <TR>
                <TH>{t('common.name')}</TH>
                <TH>{t('common.phone')}</TH>
                <TH className="text-end">{t('customers.loyaltyPoints')}</TH>
                <TH className="text-end">{t('customers.balance')}</TH>
                <TH className="text-end">{t('customers.totalSpent')}</TH>
                <TH className="text-end">{t('common.actions')}</TH>
              </TR>
            </THead>
            <TBody>
              {customers.data.data.map((customer) => (
                <TR key={customer.id}>
                  <TD className="font-medium">{customer.name}</TD>
                  <TD className="num">{customer.phone ?? '—'}</TD>
                  <TD className="text-end">
                    <Badge>{formatNumber(customer.loyaltyPoints, locale)}</Badge>
                  </TD>
                  <TD className="text-end">
                    {customer.balance > 0.005 ? (
                      <Badge variant="warning">
                        {formatMoney(customer.balance, currency, locale)}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TD>
                  <TD className="num text-end">{formatMoney(customer.totalSpent, currency, locale)}</TD>
                  <TD>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" title={t('customers.statement')} onClick={() => setStmtTarget(customer)}>
                        <ReceiptText className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" title={t('customers.purchaseHistory')} onClick={() => setHistoryTarget(customer)}>
                        <History className="h-4 w-4" />
                      </Button>
                      {canManage ? (
                        <>
                          {customer.balance > 0.005 ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              title={t('customers.recordPayment')}
                              onClick={() => setPayTarget(customer)}
                            >
                              <HandCoins className="h-4 w-4 text-emerald-600" />
                            </Button>
                          ) : null}
                          <Button
                            variant="ghost"
                            size="icon"
                            title={t('common.edit')}
                            onClick={() => {
                              setEditing(customer);
                              form.reset({
                                name: customer.name,
                                phone: customer.phone ?? '',
                                email: customer.email ?? '',
                                openingBalance: Number(customer.openingBalance),
                                creditLimit: Number(customer.creditLimit),
                              });
                              setShowForm(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title={t('common.delete')}
                            onClick={() => {
                              if (window.confirm(`${t('common.delete')}: ${customer.name}?`)) {
                                remove.mutate(customer.id);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <Pagination page={page} pageCount={customers.data.meta.pageCount} onChange={setPage} />
        </>
      )}

      <Dialog
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? t('customers.editCustomer') : t('customers.addCustomer')}
      >
        <form onSubmit={form.handleSubmit((values) => save.mutate(values))} className="space-y-3">
          <ErrorText error={save.error} />
          <Field label={t('common.name')} error={form.formState.errors.name?.message}>
            <Input {...form.register('name')} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('common.phone')}>
              <Input dir="ltr" {...form.register('phone')} />
            </Field>
            <Field label={t('common.email')} error={form.formState.errors.email?.message}>
              <Input dir="ltr" type="email" {...form.register('email')} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('customers.openingBalance')}>
              <Input type="number" step="0.01" min={0} {...form.register('openingBalance')} />
            </Field>
            <Field label={t('customers.creditLimit')}>
              <Input type="number" step="0.01" min={0} {...form.register('creditLimit')} />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={save.isPending}>{t('common.save')}</Button>
          </div>
        </form>
      </Dialog>

      <CustomerPaymentDialog customer={payTarget} onClose={() => setPayTarget(null)} />
      <CustomerStatementDialog
        customerId={stmtTarget?.id ?? null}
        customerName={stmtTarget?.name ?? ''}
        onClose={() => setStmtTarget(null)}
      />

      <Dialog
        open={Boolean(historyTarget)}
        onClose={() => setHistoryTarget(null)}
        title={`${t('customers.purchaseHistory')} — ${historyTarget?.name ?? ''}`}
        wide
      >
        {history.isLoading ? (
          <Spinner />
        ) : !history.data?.data.length ? (
          <EmptyState />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>#</TH>
                <TH>{t('common.date')}</TH>
                <TH>{t('common.branch')}</TH>
                <TH>{t('common.status')}</TH>
                <TH className="text-end">{t('common.total')}</TH>
              </TR>
            </THead>
            <TBody>
              {history.data.data.map((sale) => (
                <TR key={sale.id}>
                  <TD className="font-medium">{sale.number}</TD>
                  <TD>{formatDate(sale.createdAt, locale, true)}</TD>
                  <TD>{sale.branch.name}</TD>
                  <TD><Badge variant={statusVariant(sale.status)}>{sale.status}</Badge></TD>
                  <TD className="num text-end">{formatMoney(sale.total, currency, locale)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Dialog>
    </div>
  );
}
