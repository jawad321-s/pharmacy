'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Truck } from 'lucide-react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/stores/auth';
import { cn, formatDate, formatMoney } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';
import { Dialog } from '@/components/ui/dialog';
import { Badge, statusVariant } from '@/components/ui/badge';
import { EmptyState, ErrorText, PageHeader, Pagination, Spinner } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

interface Supplier { id: string; name: string }
interface Branch { id: string; name: string }
interface MedicineOption { id: string; name: string; nameAr: string | null; purchasePrice: string }

interface InvoiceRow {
  id: string;
  number: string;
  createdAt: string;
  total: string;
  paidAmount: string;
  supplier: { name: string };
  branch: { name: string };
  items: { id: string; batchNumber: string; quantity: number; returnedQty: number; unitCost: string; medicine: { name: string; nameAr: string | null } }[];
}

interface OrderRow {
  id: string;
  number: string;
  status: string;
  createdAt: string;
  total: string;
  supplier: { name: string };
  items: { id: string; medicineId: string; quantity: number; receivedQty: number; unitCost: string; medicine: { name: string; nameAr: string | null } }[];
}

interface InvoiceItemDraft {
  medicineId: string;
  label: string;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  unitCost: number;
}

export default function PurchasesPage() {
  const { t, locale } = useI18n();
  const { tenant, hasPermission } = useAuth();
  const currency = tenant?.currency ?? 'SAR';
  const queryClient = useQueryClient();
  const canManage = hasPermission('purchases.manage');

  const [tab, setTab] = useState<'invoices' | 'orders'>('invoices');
  const [page, setPage] = useState(1);
  const [showInvoice, setShowInvoice] = useState(false);
  const [payTarget, setPayTarget] = useState<InvoiceRow | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [returnTarget, setReturnTarget] = useState<InvoiceRow | null>(null);
  const [returnQuantities, setReturnQuantities] = useState<Record<string, string>>({});

  const invoices = useQuery({
    queryKey: ['purchase-invoices', page],
    queryFn: () =>
      api<{ data: InvoiceRow[]; meta: { pageCount: number } }>('/purchases/invoices', {
        query: { page, pageSize: 15 },
      }),
    enabled: tab === 'invoices',
  });

  const orders = useQuery({
    queryKey: ['purchase-orders', page],
    queryFn: () =>
      api<{ data: OrderRow[]; meta: { pageCount: number } }>('/purchases/orders', {
        query: { page, pageSize: 15 },
      }),
    enabled: tab === 'orders',
  });

  const recordPayment = useMutation({
    mutationFn: () =>
      api(`/purchases/invoices/${payTarget!.id}/payments`, {
        method: 'POST',
        body: { amount: Number(payAmount) },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['purchase-invoices'] });
      setPayTarget(null);
      setPayAmount('');
    },
  });

  const createReturn = useMutation({
    mutationFn: () =>
      api(`/purchases/invoices/${returnTarget!.id}/returns`, {
        method: 'POST',
        body: {
          items: Object.entries(returnQuantities)
            .filter(([, qty]) => Number(qty) > 0)
            .map(([invoiceItemId, qty]) => ({
              invoiceItemId,
              quantity: Number(qty),
            })),
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['purchase-invoices'] });
      setReturnTarget(null);
      setReturnQuantities({});
    },
  });

  return (
    <div>
      <PageHeader title={t('purchases.title')}>
        {canManage ? (
          <Button onClick={() => setShowInvoice(true)}>
            <Truck className="h-4 w-4" />
            {t('purchases.newInvoice')}
          </Button>
        ) : null}
      </PageHeader>

      <div className="mb-4 flex gap-1 border-b">
        {(['invoices', 'orders'] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => { setTab(key); setPage(1); }}
            className={cn(
              'border-b-2 px-4 py-2 text-sm font-medium',
              tab === key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t(`purchases.${key}`)}
          </button>
        ))}
      </div>

      {tab === 'invoices' ? (
        invoices.isLoading ? (
          <Spinner />
        ) : !invoices.data?.data.length ? (
          <EmptyState />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>#</TH>
                  <TH>{t('common.date')}</TH>
                  <TH>{t('purchases.supplier')}</TH>
                  <TH>{t('common.branch')}</TH>
                  <TH className="text-end">{t('common.total')}</TH>
                  <TH className="text-end">{t('purchases.paid')}</TH>
                  <TH className="text-end">{t('purchases.balance')}</TH>
                  <TH className="text-end">{t('common.actions')}</TH>
                </TR>
              </THead>
              <TBody>
                {invoices.data.data.map((invoice) => {
                  const balance = Number(invoice.total) - Number(invoice.paidAmount);
                  return (
                    <TR key={invoice.id}>
                      <TD className="font-medium">{invoice.number}</TD>
                      <TD>{formatDate(invoice.createdAt, locale)}</TD>
                      <TD>{invoice.supplier.name}</TD>
                      <TD>{invoice.branch.name}</TD>
                      <TD className="num text-end">{formatMoney(invoice.total, currency, locale)}</TD>
                      <TD className="num text-end">{formatMoney(invoice.paidAmount, currency, locale)}</TD>
                      <TD className={cn('num text-end font-medium', balance > 0 && 'text-amber-600')}>
                        {formatMoney(balance, currency, locale)}
                      </TD>
                      <TD>
                        {canManage ? (
                          <div className="flex justify-end gap-1">
                            {balance > 0.004 ? (
                              <Button variant="outline" size="sm" onClick={() => { setPayTarget(invoice); setPayAmount(String(balance.toFixed(2))); }}>
                                {t('purchases.recordPayment')}
                              </Button>
                            ) : null}
                            <Button variant="ghost" size="sm" onClick={() => setReturnTarget(invoice)}>
                              {t('purchases.return')}
                            </Button>
                          </div>
                        ) : null}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
            <Pagination page={page} pageCount={invoices.data.meta.pageCount} onChange={setPage} />
          </>
        )
      ) : orders.isLoading ? (
        <Spinner />
      ) : !orders.data?.data.length ? (
        <EmptyState />
      ) : (
        <>
          <Table>
            <THead>
              <TR>
                <TH>#</TH>
                <TH>{t('common.date')}</TH>
                <TH>{t('purchases.supplier')}</TH>
                <TH className="text-end">{t('common.total')}</TH>
                <TH>{t('common.status')}</TH>
              </TR>
            </THead>
            <TBody>
              {orders.data.data.map((order) => (
                <TR key={order.id}>
                  <TD className="font-medium">{order.number}</TD>
                  <TD>{formatDate(order.createdAt, locale)}</TD>
                  <TD>{order.supplier.name}</TD>
                  <TD className="num text-end">{formatMoney(order.total, currency, locale)}</TD>
                  <TD><Badge variant={statusVariant(order.status)}>{order.status}</Badge></TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <Pagination page={page} pageCount={orders.data.meta.pageCount} onChange={setPage} />
        </>
      )}

      <ReceiveGoodsDialog open={showInvoice} onClose={() => setShowInvoice(false)} />

      <Dialog
        open={Boolean(payTarget)}
        onClose={() => setPayTarget(null)}
        title={`${t('purchases.recordPayment')} — ${payTarget?.number ?? ''}`}
      >
        <div className="space-y-3">
          <ErrorText error={recordPayment.error} />
          <Field label={t('common.amount')}>
            <Input type="number" min={0.01} step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
          </Field>
          <Button className="w-full" loading={recordPayment.isPending} disabled={Number(payAmount) <= 0} onClick={() => recordPayment.mutate()}>
            {t('common.save')}
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={Boolean(returnTarget)}
        onClose={() => setReturnTarget(null)}
        title={`${t('purchases.returnToSupplier')} — ${returnTarget?.number ?? ''}`}
        wide
      >
        <div className="space-y-3">
          <ErrorText error={createReturn.error} />
          <Table>
            <THead>
              <TR>
                <TH>{t('nav.medicines')}</TH>
                <TH>{t('medicines.batchNumber')}</TH>
                <TH className="text-end">{t('purchases.received')}</TH>
                <TH className="text-end">{t('purchases.return')}</TH>
              </TR>
            </THead>
            <TBody>
              {returnTarget?.items.map((item) => (
                <TR key={item.id}>
                  <TD>{locale === 'ar' && item.medicine.nameAr ? item.medicine.nameAr : item.medicine.name}</TD>
                  <TD className="num text-xs">{item.batchNumber}</TD>
                  <TD className="num text-end">{item.quantity - item.returnedQty}</TD>
                  <TD className="text-end">
                    <Input
                      type="number"
                      min={0}
                      max={item.quantity - item.returnedQty}
                      className="ms-auto w-24"
                      value={returnQuantities[item.id] ?? ''}
                      onChange={(e) =>
                        setReturnQuantities({ ...returnQuantities, [item.id]: e.target.value })
                      }
                    />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <Button
            className="w-full"
            loading={createReturn.isPending}
            disabled={!Object.values(returnQuantities).some((qty) => Number(qty) > 0)}
            onClick={() => createReturn.mutate()}
          >
            {t('common.confirm')}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function ReceiveGoodsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, locale } = useI18n();
  const { tenant } = useAuth();
  const currency = tenant?.currency ?? 'SAR';
  const queryClient = useQueryClient();

  const [supplierId, setSupplierId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [paidAmount, setPaidAmount] = useState('');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<InvoiceItemDraft[]>([]);

  const suppliers = useQuery({
    queryKey: ['suppliers-all'],
    queryFn: () => api<{ data: Supplier[] }>('/suppliers', { query: { pageSize: 100 } }),
    enabled: open,
  });
  const branches = useQuery({
    queryKey: ['branches'],
    queryFn: () => api<Branch[]>('/branches'),
    enabled: open,
  });
  const medicines = useQuery({
    queryKey: ['purchase-medicines', search],
    queryFn: () =>
      api<{ data: MedicineOption[] }>('/medicines', {
        query: { search, pageSize: 8, status: 'ACTIVE' },
      }),
    enabled: open && search.length >= 2,
  });

  const total = items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);

  const create = useMutation({
    mutationFn: () =>
      api('/purchases/invoices', {
        method: 'POST',
        body: {
          supplierId,
          branchId,
          paidAmount: Number(paidAmount || 0),
          items: items.map((item) => ({
            medicineId: item.medicineId,
            batchNumber: item.batchNumber,
            expiryDate: item.expiryDate,
            quantity: item.quantity,
            unitCost: item.unitCost,
          })),
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['purchase-invoices'] });
      void queryClient.invalidateQueries({ queryKey: ['inventory-stock'] });
      setItems([]);
      setPaidAmount('');
      onClose();
    },
  });

  const valid =
    supplierId &&
    branchId &&
    items.length > 0 &&
    items.every((item) => item.batchNumber && item.expiryDate && item.quantity > 0);

  return (
    <Dialog open={open} onClose={onClose} title={t('purchases.newInvoice')} wide>
      <div className="space-y-3">
        <ErrorText error={create.error} />
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('purchases.supplier')}>
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">—</option>
              {suppliers.data?.data.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
              ))}
            </Select>
          </Field>
          <Field label={t('common.branch')}>
            <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">—</option>
              {branches.data?.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label={t('purchases.addItem')}>
          <Input
            placeholder={t('common.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Field>
        {search.length >= 2 ? (
          <div className="max-h-32 space-y-1 overflow-y-auto">
            {medicines.data?.data.map((medicine) => (
              <button
                key={medicine.id}
                type="button"
                className="flex w-full items-center justify-between rounded-md border p-2 text-start text-sm hover:bg-accent"
                onClick={() => {
                  setItems([
                    ...items,
                    {
                      medicineId: medicine.id,
                      label: locale === 'ar' && medicine.nameAr ? medicine.nameAr : medicine.name,
                      batchNumber: '',
                      expiryDate: '',
                      quantity: 1,
                      unitCost: Number(medicine.purchasePrice),
                    },
                  ]);
                  setSearch('');
                }}
              >
                <span>{locale === 'ar' && medicine.nameAr ? medicine.nameAr : medicine.name}</span>
                <span className="num text-xs text-muted-foreground">
                  {formatMoney(medicine.purchasePrice, currency, locale)}
                </span>
              </button>
            ))}
          </div>
        ) : null}

        {items.length > 0 ? (
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {items.map((item, index) => (
              <div key={`${item.medicineId}-${index}`} className="grid grid-cols-12 items-end gap-2 rounded-md border p-2">
                <p className="col-span-12 truncate text-sm font-medium">{item.label}</p>
                <Field label={t('medicines.batchNumber')} className="col-span-3">
                  <Input
                    dir="ltr"
                    value={item.batchNumber}
                    onChange={(e) => {
                      const next = [...items];
                      next[index] = { ...item, batchNumber: e.target.value };
                      setItems(next);
                    }}
                  />
                </Field>
                <Field label={t('medicines.expiryDate')} className="col-span-3">
                  <Input
                    type="date"
                    value={item.expiryDate}
                    onChange={(e) => {
                      const next = [...items];
                      next[index] = { ...item, expiryDate: e.target.value };
                      setItems(next);
                    }}
                  />
                </Field>
                <Field label={t('common.quantity')} className="col-span-2">
                  <Input
                    type="number"
                    min={1}
                    value={item.quantity}
                    onChange={(e) => {
                      const next = [...items];
                      next[index] = { ...item, quantity: Number(e.target.value) };
                      setItems(next);
                    }}
                  />
                </Field>
                <Field label={t('purchases.unitCost')} className="col-span-3">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={item.unitCost}
                    onChange={(e) => {
                      const next = [...items];
                      next[index] = { ...item, unitCost: Number(e.target.value) };
                      setItems(next);
                    }}
                  />
                </Field>
                <Button
                  variant="ghost"
                  size="sm"
                  className="col-span-1"
                  onClick={() => setItems(items.filter((_, i) => i !== index))}
                >
                  ✕
                </Button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-3">
          <Field label={t('purchases.paid')} className="w-40">
            <Input type="number" min={0} step="0.01" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} />
          </Field>
          <div className="text-end">
            <p className="text-sm text-muted-foreground">{t('common.total')}</p>
            <p className="num text-xl font-bold">{formatMoney(total, currency, locale)}</p>
          </div>
        </div>
        <Button className="w-full" loading={create.isPending} disabled={!valid} onClick={() => create.mutate()}>
          <Plus className="h-4 w-4" />
          {t('common.create')}
        </Button>
      </div>
    </Dialog>
  );
}
