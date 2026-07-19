'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, ClipboardList, Plus, SlidersHorizontal } from 'lucide-react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/stores/auth';
import { cn, formatDate, formatMoney, formatNumber } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Dialog } from '@/components/ui/dialog';
import { Badge, statusVariant } from '@/components/ui/badge';
import { EmptyState, ErrorText, PageHeader, Pagination, Spinner } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

type Tab = 'stock' | 'movements' | 'counts' | 'transfers';

interface StockBatch {
  id: string;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  isExpired: boolean;
  isNearExpiry: boolean;
}

interface StockRow {
  id: string;
  name: string;
  nameAr: string | null;
  barcode: string;
  unit: string;
  minStock: number;
  totalQuantity: number;
  usableQuantity: number;
  inventoryValue: number;
  isOutOfStock: boolean;
  isLowStock: boolean;
  hasNearExpiry: boolean;
  hasExpired: boolean;
  batches: StockBatch[];
}

interface Branch { id: string; name: string }

function InventoryContent() {
  const { t, locale } = useI18n();
  const { tenant, hasPermission } = useAuth();
  const currency = tenant?.currency ?? 'SAR';
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<Tab>('stock');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [branchId, setBranchId] = useState('');
  const [alert, setAlert] = useState(searchParams.get('alert') ?? '');
  const [adjustBatch, setAdjustBatch] = useState<{ medicine: StockRow; batch: StockBatch } | null>(null);
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [showTransfer, setShowTransfer] = useState(false);
  const [showCount, setShowCount] = useState(false);
  const [activeCount, setActiveCount] = useState<string | null>(null);

  const branches = useQuery({
    queryKey: ['branches'],
    queryFn: () => api<Branch[]>('/branches'),
  });

  const stock = useQuery({
    queryKey: ['inventory-stock', search, page, branchId, alert],
    queryFn: () =>
      api<{ data: StockRow[]; meta: { pageCount: number } }>('/inventory/stock', {
        query: { search, page, pageSize: 15, branchId, alert },
      }),
    enabled: tab === 'stock',
  });

  const movements = useQuery({
    queryKey: ['inventory-movements', page, branchId],
    queryFn: () =>
      api<{ data: MovementRow[]; meta: { pageCount: number } }>('/inventory/movements', {
        query: { page, pageSize: 20, branchId },
      }),
    enabled: tab === 'movements',
  });

  interface MovementRow {
    id: string;
    type: string;
    quantity: number;
    balanceAfter: number;
    reason: string | null;
    createdAt: string;
    medicine: { name: string; nameAr: string | null };
    batch: { batchNumber: string } | null;
    branch: { name: string };
    user: { firstName: string; lastName: string } | null;
  }

  interface CountRow {
    id: string;
    number: string;
    type: string;
    status: string;
    createdAt: string;
    branch: { name: string };
    user: { firstName: string; lastName: string } | null;
    _count: { items: number };
  }

  interface TransferRow {
    id: string;
    number: string;
    status: string;
    createdAt: string;
    fromBranch: { name: string };
    toBranch: { name: string };
    items: { id: string; quantity: number; batch: { medicine: { name: string; nameAr: string | null } } }[];
  }

  const counts = useQuery({
    queryKey: ['inventory-counts'],
    queryFn: () => api<CountRow[]>('/inventory/counts'),
    enabled: tab === 'counts',
  });

  const transfers = useQuery({
    queryKey: ['inventory-transfers'],
    queryFn: () => api<TransferRow[]>('/inventory/transfers'),
    enabled: tab === 'transfers',
  });

  const adjust = useMutation({
    mutationFn: () =>
      api('/inventory/adjust', {
        method: 'POST',
        body: {
          branchId: branchId || branches.data?.[0]?.id,
          batchId: adjustBatch!.batch.id,
          quantityChange: Number(adjustQty),
          reason: adjustReason,
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory-stock'] });
      setAdjustBatch(null);
      setAdjustQty('');
      setAdjustReason('');
    },
  });

  const completeTransfer = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'complete' | 'cancel' }) =>
      api(`/inventory/transfers/${id}/${action}`, { method: 'POST', body: {} }),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['inventory-transfers'] }),
  });

  const tabs: { key: Tab; label: string }[] = [
    { key: 'stock', label: t('inventory.stock') },
    { key: 'movements', label: t('inventory.movements') },
    { key: 'counts', label: t('inventory.counts') },
    { key: 'transfers', label: t('inventory.transfers') },
  ];

  return (
    <div>
      <PageHeader title={t('inventory.title')}>
        <Select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="w-44">
          <option value="">{t('common.allBranches')}</option>
          {branches.data?.map((branch) => (
            <option key={branch.id} value={branch.id}>{branch.name}</option>
          ))}
        </Select>
        {hasPermission('inventory.transfer') ? (
          <Button variant="outline" onClick={() => setShowTransfer(true)}>
            <ArrowLeftRight className="h-4 w-4" />
            {t('inventory.newTransfer')}
          </Button>
        ) : null}
        {hasPermission('inventory.count') ? (
          <Button onClick={() => setShowCount(true)}>
            <ClipboardList className="h-4 w-4" />
            {t('inventory.newCount')}
          </Button>
        ) : null}
      </PageHeader>

      <div className="mb-4 flex gap-1 border-b">
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => {
              setTab(item.key);
              setPage(1);
            }}
            className={cn(
              'border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              tab === item.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'stock' ? (
        <>
          <div className="mb-3 flex gap-2">
            <Input
              placeholder={t('common.search')}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-56"
            />
            <Select value={alert} onChange={(e) => { setAlert(e.target.value); setPage(1); }} className="w-44">
              <option value="">{t('dashboard.alerts')}</option>
              <option value="out">{t('dashboard.outOfStock')}</option>
              <option value="low">{t('dashboard.lowStock')}</option>
              <option value="nearExpiry">{t('dashboard.nearExpiry')}</option>
              <option value="expired">{t('dashboard.expired')}</option>
            </Select>
          </div>
          {stock.isLoading ? (
            <Spinner />
          ) : !stock.data?.data.length ? (
            <EmptyState />
          ) : (
            <>
              <div className="space-y-2">
                {stock.data.data.map((row) => (
                  <details key={row.id} className="rounded-lg border bg-card">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {locale === 'ar' && row.nameAr ? row.nameAr : row.name}
                        </p>
                        <p className="num text-xs text-muted-foreground">{row.barcode}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {row.hasExpired ? <Badge variant="destructive">{t('dashboard.expired')}</Badge> : null}
                        {row.hasNearExpiry ? <Badge variant="warning">{t('dashboard.nearExpiry')}</Badge> : null}
                        <Badge
                          variant={row.isOutOfStock ? 'destructive' : row.isLowStock ? 'warning' : 'success'}
                        >
                          {formatNumber(row.usableQuantity, locale)} {row.unit}
                        </Badge>
                        <span className="num hidden text-sm text-muted-foreground sm:block">
                          {formatMoney(row.inventoryValue, currency, locale)}
                        </span>
                      </div>
                    </summary>
                    <div className="border-t p-3">
                      <Table>
                        <THead>
                          <TR>
                            <TH>{t('medicines.batchNumber')}</TH>
                            <TH>{t('medicines.expiryDate')}</TH>
                            <TH className="text-end">{t('common.quantity')}</TH>
                            <TH className="text-end">{t('common.actions')}</TH>
                          </TR>
                        </THead>
                        <TBody>
                          {row.batches.map((batch) => (
                            <TR key={batch.id}>
                              <TD className="num">{batch.batchNumber}</TD>
                              <TD>
                                <span className={cn(batch.isExpired && 'text-destructive', batch.isNearExpiry && 'text-amber-600')}>
                                  {formatDate(batch.expiryDate, locale)}
                                </span>
                              </TD>
                              <TD className="num text-end">{batch.quantity}</TD>
                              <TD className="text-end">
                                {hasPermission('inventory.adjust') ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setAdjustBatch({ medicine: row, batch })}
                                  >
                                    <SlidersHorizontal className="h-3.5 w-3.5" />
                                    {t('inventory.adjust')}
                                  </Button>
                                ) : null}
                              </TD>
                            </TR>
                          ))}
                        </TBody>
                      </Table>
                    </div>
                  </details>
                ))}
              </div>
              <Pagination page={page} pageCount={stock.data.meta.pageCount} onChange={setPage} />
            </>
          )}
        </>
      ) : null}

      {tab === 'movements' ? (
        movements.isLoading ? (
          <Spinner />
        ) : !movements.data?.data.length ? (
          <EmptyState />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>{t('common.date')}</TH>
                  <TH>{t('nav.medicines')}</TH>
                  <TH>{t('medicines.batchNumber')}</TH>
                  <TH>{t('inventory.movementType')}</TH>
                  <TH className="text-end">{t('common.quantity')}</TH>
                  <TH className="text-end">{t('inventory.balanceAfter')}</TH>
                  <TH>{t('common.branch')}</TH>
                  <TH>{t('audit.user')}</TH>
                </TR>
              </THead>
              <TBody>
                {movements.data.data.map((movement) => (
                  <TR key={movement.id}>
                    <TD className="text-xs">{formatDate(movement.createdAt, locale, true)}</TD>
                    <TD>{locale === 'ar' && movement.medicine.nameAr ? movement.medicine.nameAr : movement.medicine.name}</TD>
                    <TD className="num text-xs">{movement.batch?.batchNumber ?? '—'}</TD>
                    <TD><Badge variant="muted">{movement.type}</Badge></TD>
                    <TD className={cn('num text-end font-medium', movement.quantity < 0 ? 'text-destructive' : 'text-emerald-600')}>
                      {movement.quantity > 0 ? '+' : ''}{movement.quantity}
                    </TD>
                    <TD className="num text-end">{movement.balanceAfter}</TD>
                    <TD>{movement.branch.name}</TD>
                    <TD className="text-xs">
                      {movement.user ? `${movement.user.firstName} ${movement.user.lastName}` : '—'}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination page={page} pageCount={movements.data.meta.pageCount} onChange={setPage} />
          </>
        )
      ) : null}

      {tab === 'counts' ? (
        counts.isLoading ? (
          <Spinner />
        ) : !counts.data?.length ? (
          <EmptyState />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>#</TH>
                <TH>{t('inventory.countType')}</TH>
                <TH>{t('common.branch')}</TH>
                <TH>{t('common.date')}</TH>
                <TH>{t('common.status')}</TH>
                <TH className="text-end">{t('common.actions')}</TH>
              </TR>
            </THead>
            <TBody>
              {counts.data.map((count) => (
                <TR key={count.id}>
                  <TD className="font-medium">{count.number}</TD>
                  <TD>{count.type}</TD>
                  <TD>{count.branch.name}</TD>
                  <TD>{formatDate(count.createdAt, locale, true)}</TD>
                  <TD><Badge variant={statusVariant(count.status)}>{count.status}</Badge></TD>
                  <TD className="text-end">
                    {count.status === 'IN_PROGRESS' ? (
                      <Button variant="outline" size="sm" onClick={() => setActiveCount(count.id)}>
                        {t('inventory.completeCount')}
                      </Button>
                    ) : null}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )
      ) : null}

      {tab === 'transfers' ? (
        transfers.isLoading ? (
          <Spinner />
        ) : !transfers.data?.length ? (
          <EmptyState />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>#</TH>
                <TH>{t('inventory.fromBranch')}</TH>
                <TH>{t('inventory.toBranch')}</TH>
                <TH>{t('common.date')}</TH>
                <TH>{t('common.status')}</TH>
                <TH className="text-end">{t('common.actions')}</TH>
              </TR>
            </THead>
            <TBody>
              {transfers.data.map((transfer) => (
                <TR key={transfer.id}>
                  <TD className="font-medium">{transfer.number}</TD>
                  <TD>{transfer.fromBranch.name}</TD>
                  <TD>{transfer.toBranch.name}</TD>
                  <TD>{formatDate(transfer.createdAt, locale, true)}</TD>
                  <TD><Badge variant={statusVariant(transfer.status)}>{transfer.status}</Badge></TD>
                  <TD className="text-end">
                    {transfer.status === 'IN_TRANSIT' ? (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" onClick={() => completeTransfer.mutate({ id: transfer.id, action: 'complete' })}>
                          {t('inventory.receive')}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => completeTransfer.mutate({ id: transfer.id, action: 'cancel' })}>
                          {t('common.cancel')}
                        </Button>
                      </div>
                    ) : null}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )
      ) : null}

      {/* Adjust dialog */}
      <Dialog
        open={Boolean(adjustBatch)}
        onClose={() => setAdjustBatch(null)}
        title={`${t('inventory.adjust')} — ${adjustBatch?.batch.batchNumber ?? ''}`}
      >
        <div className="space-y-3">
          <ErrorText error={adjust.error} />
          <Field label={t('inventory.quantityChange')}>
            <Input
              type="number"
              value={adjustQty}
              onChange={(e) => setAdjustQty(e.target.value)}
              placeholder="+10 / -5"
            />
          </Field>
          <Field label={t('common.reason')}>
            <Textarea value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} />
          </Field>
          <Button
            className="w-full"
            loading={adjust.isPending}
            disabled={!adjustQty || Number(adjustQty) === 0 || !adjustReason}
            onClick={() => adjust.mutate()}
          >
            {t('common.save')}
          </Button>
        </div>
      </Dialog>

      <TransferDialog
        open={showTransfer}
        onClose={() => setShowTransfer(false)}
        branches={branches.data ?? []}
      />
      <NewCountDialog
        open={showCount}
        onClose={() => setShowCount(false)}
        branches={branches.data ?? []}
      />
      <CompleteCountDialog countId={activeCount} onClose={() => setActiveCount(null)} />
    </div>
  );
}

function TransferDialog({
  open,
  onClose,
  branches,
}: {
  open: boolean;
  onClose: () => void;
  branches: Branch[];
}) {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const [fromBranchId, setFromBranchId] = useState('');
  const [toBranchId, setToBranchId] = useState('');
  const [items, setItems] = useState<{ batchId: string; quantity: number; label: string }[]>([]);
  const [search, setSearch] = useState('');

  const stock = useQuery({
    queryKey: ['transfer-stock', fromBranchId, search],
    queryFn: () =>
      api<{ data: { id: string; name: string; nameAr: string | null; batches: { id: string; batchNumber: string; quantity: number }[] }[] }>(
        '/inventory/stock',
        { query: { branchId: fromBranchId, search, pageSize: 10 } },
      ),
    enabled: open && Boolean(fromBranchId) && search.length >= 2,
  });

  const create = useMutation({
    mutationFn: () =>
      api('/inventory/transfers', {
        method: 'POST',
        body: {
          fromBranchId,
          toBranchId,
          items: items.map(({ batchId, quantity }) => ({ batchId, quantity })),
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory-transfers'] });
      void queryClient.invalidateQueries({ queryKey: ['inventory-stock'] });
      setItems([]);
      onClose();
    },
  });

  return (
    <Dialog open={open} onClose={onClose} title={t('inventory.newTransfer')} wide>
      <div className="space-y-3">
        <ErrorText error={create.error} />
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('inventory.fromBranch')}>
            <Select value={fromBranchId} onChange={(e) => setFromBranchId(e.target.value)}>
              <option value="">—</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </Select>
          </Field>
          <Field label={t('inventory.toBranch')}>
            <Select value={toBranchId} onChange={(e) => setToBranchId(e.target.value)}>
              <option value="">—</option>
              {branches
                .filter((branch) => branch.id !== fromBranchId)
                .map((branch) => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
            </Select>
          </Field>
        </div>
        <Input
          placeholder={t('common.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          disabled={!fromBranchId}
        />
        <div className="max-h-40 space-y-1 overflow-y-auto">
          {stock.data?.data.flatMap((medicine) =>
            medicine.batches
              .filter((batch) => batch.quantity > 0)
              .map((batch) => (
                <button
                  key={batch.id}
                  type="button"
                  className="flex w-full items-center justify-between rounded-md border p-2 text-start text-sm hover:bg-accent"
                  onClick={() => {
                    if (items.some((item) => item.batchId === batch.id)) return;
                    setItems([
                      ...items,
                      {
                        batchId: batch.id,
                        quantity: 1,
                        label: `${locale === 'ar' && medicine.nameAr ? medicine.nameAr : medicine.name} (${batch.batchNumber})`,
                      },
                    ]);
                  }}
                >
                  <span>
                    {locale === 'ar' && medicine.nameAr ? medicine.nameAr : medicine.name}{' '}
                    <span className="num text-xs text-muted-foreground">{batch.batchNumber}</span>
                  </span>
                  <span className="num text-xs">{batch.quantity}</span>
                </button>
              )),
          )}
        </div>
        {items.length > 0 ? (
          <div className="space-y-1">
            {items.map((item, index) => (
              <div key={item.batchId} className="flex items-center gap-2">
                <span className="flex-1 truncate text-sm">{item.label}</span>
                <Input
                  type="number"
                  min={1}
                  className="w-24"
                  value={item.quantity}
                  onChange={(e) => {
                    const next = [...items];
                    next[index] = { ...item, quantity: Number(e.target.value) };
                    setItems(next);
                  }}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setItems(items.filter((i) => i.batchId !== item.batchId))}
                >
                  ✕
                </Button>
              </div>
            ))}
          </div>
        ) : null}
        <Button
          className="w-full"
          loading={create.isPending}
          disabled={!fromBranchId || !toBranchId || items.length === 0}
          onClick={() => create.mutate()}
        >
          {t('common.create')}
        </Button>
      </div>
    </Dialog>
  );
}

function NewCountDialog({
  open,
  onClose,
  branches,
}: {
  open: boolean;
  onClose: () => void;
  branches: Branch[];
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [branchId, setBranchId] = useState('');
  const [type, setType] = useState('FULL');

  const create = useMutation({
    mutationFn: () =>
      api('/inventory/counts', { method: 'POST', body: { branchId, type } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory-counts'] });
      onClose();
    },
  });

  return (
    <Dialog open={open} onClose={onClose} title={t('inventory.newCount')}>
      <div className="space-y-3">
        <ErrorText error={create.error} />
        <Field label={t('common.branch')}>
          <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">—</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>{branch.name}</option>
            ))}
          </Select>
        </Field>
        <Field label={t('inventory.countType')}>
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="FULL">{t('inventory.fullCount')}</option>
            <option value="CYCLE">{t('inventory.cycleCount')}</option>
            <option value="SPOT">{t('inventory.spotCheck')}</option>
          </Select>
        </Field>
        <Button className="w-full" loading={create.isPending} disabled={!branchId} onClick={() => create.mutate()}>
          <Plus className="h-4 w-4" />
          {t('common.create')}
        </Button>
      </div>
    </Dialog>
  );
}

function CompleteCountDialog({
  countId,
  onClose,
}: {
  countId: string | null;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({});

  interface CountDetail {
    id: string;
    number: string;
    items: {
      id: string;
      batchId: string;
      expectedQty: number;
      countedQty: number | null;
      batch: { batchNumber: string; medicine: { name: string; nameAr: string | null } };
    }[];
  }

  const count = useQuery({
    queryKey: ['inventory-count', countId],
    queryFn: () => api<CountDetail>(`/inventory/counts/${countId}`),
    enabled: Boolean(countId),
  });

  const complete = useMutation({
    mutationFn: () =>
      api(`/inventory/counts/${countId}/complete`, {
        method: 'POST',
        body: {
          items: (count.data?.items ?? []).map((item) => ({
            batchId: item.batchId,
            countedQty: Number(values[item.batchId] ?? item.expectedQty),
          })),
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory-counts'] });
      void queryClient.invalidateQueries({ queryKey: ['inventory-stock'] });
      setValues({});
      onClose();
    },
  });

  return (
    <Dialog
      open={Boolean(countId)}
      onClose={onClose}
      title={`${t('inventory.completeCount')} — ${count.data?.number ?? ''}`}
      wide
    >
      {count.isLoading ? (
        <Spinner />
      ) : (
        <div className="space-y-3">
          <ErrorText error={complete.error} />
          <div className="max-h-96 overflow-y-auto">
            <Table>
              <THead>
                <TR>
                  <TH>{t('nav.medicines')}</TH>
                  <TH>{t('medicines.batchNumber')}</TH>
                  <TH className="text-end">{t('inventory.expected')}</TH>
                  <TH className="text-end">{t('inventory.counted')}</TH>
                  <TH className="text-end">{t('inventory.variance')}</TH>
                </TR>
              </THead>
              <TBody>
                {count.data?.items.map((item) => {
                  const counted = values[item.batchId] ?? String(item.expectedQty);
                  const variance = Number(counted) - item.expectedQty;
                  return (
                    <TR key={item.id}>
                      <TD>
                        {locale === 'ar' && item.batch.medicine.nameAr
                          ? item.batch.medicine.nameAr
                          : item.batch.medicine.name}
                      </TD>
                      <TD className="num text-xs">{item.batch.batchNumber}</TD>
                      <TD className="num text-end">{item.expectedQty}</TD>
                      <TD className="text-end">
                        <Input
                          type="number"
                          min={0}
                          className="ms-auto w-24"
                          value={counted}
                          onChange={(e) =>
                            setValues({ ...values, [item.batchId]: e.target.value })
                          }
                        />
                      </TD>
                      <TD className={cn('num text-end font-medium', variance < 0 ? 'text-destructive' : variance > 0 ? 'text-emerald-600' : '')}>
                        {variance > 0 ? '+' : ''}{variance}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </div>
          <Button className="w-full" loading={complete.isPending} onClick={() => complete.mutate()}>
            {t('inventory.completeCount')}
          </Button>
        </div>
      )}
    </Dialog>
  );
}

export default function InventoryPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <InventoryContent />
    </Suspense>
  );
}
