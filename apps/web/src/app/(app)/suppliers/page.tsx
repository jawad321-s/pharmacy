'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { BookOpen, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/stores/auth';
import { cn, formatDate, formatMoney } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState, ErrorText, PageHeader, Pagination, Spinner } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

const schema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().optional(),
  openingBalance: z.coerce.number().optional(),
});
type FormValues = z.infer<typeof schema>;

interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  openingBalance: string;
  balance: number;
  isActive: boolean;
}

interface LedgerData {
  supplier: Supplier;
  openingBalance: number;
  balance: number;
  entries: { date: string; type: string; reference: string; debit: number; credit: number; balance: number }[];
}

export default function SuppliersPage() {
  const { t, locale } = useI18n();
  const { tenant, hasPermission } = useAuth();
  const currency = tenant?.currency ?? 'ILS';
  const queryClient = useQueryClient();
  const canManage = hasPermission('suppliers.manage');

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [ledgerId, setLedgerId] = useState<string | null>(null);

  const suppliers = useQuery({
    queryKey: ['suppliers', search, page],
    queryFn: () =>
      api<{ data: Supplier[]; meta: { pageCount: number } }>('/suppliers', {
        query: { search, page, pageSize: 15 },
      }),
  });

  const ledger = useQuery({
    queryKey: ['supplier-ledger', ledgerId],
    queryFn: () => api<LedgerData>(`/suppliers/${ledgerId}/ledger`),
    enabled: Boolean(ledgerId),
  });

  const form = useForm<FormValues>({ resolver: zodResolver(schema) });

  const save = useMutation({
    mutationFn: (values: FormValues) => {
      const body = { ...values, email: values.email || undefined };
      return editing
        ? api(`/suppliers/${editing.id}`, { method: 'PATCH', body })
        : api('/suppliers', { method: 'POST', body });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      setShowForm(false);
      setEditing(null);
      form.reset();
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/suppliers/${id}`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
  });

  return (
    <div>
      <PageHeader title={t('suppliers.title')}>
        <Input
          placeholder={t('common.search')}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-52"
        />
        {canManage ? (
          <Button onClick={() => { setEditing(null); form.reset({}); setShowForm(true); }}>
            <Plus className="h-4 w-4" />
            {t('suppliers.addSupplier')}
          </Button>
        ) : null}
      </PageHeader>

      {suppliers.isLoading ? (
        <Spinner />
      ) : !suppliers.data?.data.length ? (
        <EmptyState />
      ) : (
        <>
          <Table>
            <THead>
              <TR>
                <TH>{t('common.name')}</TH>
                <TH>{t('common.phone')}</TH>
                <TH>{t('common.email')}</TH>
                <TH className="text-end">{t('purchases.balance')}</TH>
                <TH className="text-end">{t('common.actions')}</TH>
              </TR>
            </THead>
            <TBody>
              {suppliers.data.data.map((supplier) => (
                <TR key={supplier.id}>
                  <TD className="font-medium">{supplier.name}</TD>
                  <TD className="num">{supplier.phone ?? '—'}</TD>
                  <TD>{supplier.email ?? '—'}</TD>
                  <TD className={cn('num text-end font-medium', supplier.balance > 0 && 'text-amber-600')}>
                    {formatMoney(supplier.balance, currency, locale)}
                  </TD>
                  <TD>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" title={t('suppliers.ledger')} onClick={() => setLedgerId(supplier.id)}>
                        <BookOpen className="h-4 w-4" />
                      </Button>
                      {canManage ? (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            title={t('common.edit')}
                            onClick={() => {
                              setEditing(supplier);
                              form.reset({
                                name: supplier.name,
                                phone: supplier.phone ?? '',
                                email: supplier.email ?? '',
                                address: supplier.address ?? '',
                                openingBalance: Number(supplier.openingBalance),
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
                              if (window.confirm(`${t('common.delete')}: ${supplier.name}?`)) {
                                remove.mutate(supplier.id);
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
          <Pagination page={page} pageCount={suppliers.data.meta.pageCount} onChange={setPage} />
        </>
      )}

      <Dialog
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? t('suppliers.editSupplier') : t('suppliers.addSupplier')}
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
          <Field label={t('common.address')}>
            <Input {...form.register('address')} />
          </Field>
          <Field label={t('suppliers.openingBalance')}>
            <Input type="number" step="0.01" {...form.register('openingBalance')} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={save.isPending}>{t('common.save')}</Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={Boolean(ledgerId)}
        onClose={() => setLedgerId(null)}
        title={`${t('suppliers.ledger')} — ${ledger.data?.supplier.name ?? ''}`}
        wide
      >
        {ledger.isLoading ? (
          <Spinner />
        ) : ledger.data ? (
          <div className="space-y-3">
            <Table>
              <THead>
                <TR>
                  <TH>{t('common.date')}</TH>
                  <TH>#</TH>
                  <TH className="text-end">{t('suppliers.debit')}</TH>
                  <TH className="text-end">{t('suppliers.credit')}</TH>
                  <TH className="text-end">{t('purchases.balance')}</TH>
                </TR>
              </THead>
              <TBody>
                {ledger.data.entries.map((entry, index) => (
                  <TR key={index}>
                    <TD>{formatDate(entry.date, locale)}</TD>
                    <TD className="font-medium">{entry.reference}</TD>
                    <TD className="num text-end">{entry.debit ? formatMoney(entry.debit, currency, locale) : '—'}</TD>
                    <TD className="num text-end">{entry.credit ? formatMoney(entry.credit, currency, locale) : '—'}</TD>
                    <TD className="num text-end font-medium">{formatMoney(entry.balance, currency, locale)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <p className="text-end text-sm">
              {t('purchases.balance')}:{' '}
              <span className="num font-bold">{formatMoney(ledger.data.balance, currency, locale)}</span>
            </p>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
