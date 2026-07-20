'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Minus, Plus, Printer, ScanBarcode, Trash2, UserRound } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/stores/auth';
import { usePos, type CartItem } from '@/stores/pos';
import { cn, formatMoney } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';
import { Dialog } from '@/components/ui/dialog';
import { ErrorText } from '@/components/ui/misc';

interface MedicineHit {
  id: string;
  name: string;
  nameAr: string | null;
  barcode: string;
  sellingPrice: string;
  taxRate: string;
  totalQuantity: number;
}

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  loyaltyPoints: number;
}

interface Branch {
  id: string;
  name: string;
  isMain: boolean;
  isActive: boolean;
}

interface CompletedSale {
  id: string;
  number: string;
  total: string;
  changeAmount: string;
  paymentCurrency: string;
  paidCurrencyAmount: string;
  exchangeRate: string;
  items: {
    id: string;
    quantity: number;
    unitPrice: string;
    total: string;
    medicine: { name: string; nameAr: string | null };
  }[];
}

interface TenantSettings {
  currency: string;
  settings: { exchangeRates: Record<string, number> } | null;
}

const REDEEM_VALUE = 0.01;

export default function PosPage() {
  const { t, locale } = useI18n();
  const { user, tenant } = useAuth();
  const currency = tenant?.currency ?? 'ILS';
  const pos = usePos();

  const tenantInfo = useQuery({
    queryKey: ['tenant-me'],
    queryFn: () => api<TenantSettings>('/tenant/me'),
  });
  const rates = tenantInfo.data?.settings?.exchangeRates ?? {};
  // Payment currencies: base first, then any configured foreign currencies.
  const payCurrencies = [currency, ...Object.keys(rates)];

  const [payCurrency, setPayCurrency] = useState(currency);
  const rateFor = (code: string) => (code === currency ? 1 : Number(rates[code]) || 1);

  const [branchId, setBranchId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showCheckout, setShowCheckout] = useState(false);
  const [showCustomer, setShowCustomer] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [paidAmount, setPaidAmount] = useState('');
  const [completedSale, setCompletedSale] = useState<CompletedSale | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  const branches = useQuery({
    queryKey: ['branches'],
    queryFn: () => api<Branch[]>('/branches'),
  });

  useEffect(() => {
    if (!branchId && branches.data?.length) {
      const preferred =
        branches.data.find((branch) => branch.id === user?.branchId) ??
        branches.data.find((branch) => branch.isMain) ??
        branches.data[0];
      setBranchId(preferred.id);
    }
  }, [branches.data, branchId, user?.branchId]);

  const searchResults = useQuery({
    queryKey: ['pos-search', searchTerm, branchId],
    queryFn: () =>
      api<{ data: MedicineHit[] }>('/medicines', {
        query: { search: searchTerm, pageSize: 8, status: 'ACTIVE', branchId },
      }),
    enabled: searchTerm.length >= 2,
  });

  const customers = useQuery({
    queryKey: ['pos-customers', customerSearch],
    queryFn: () =>
      api<{ data: Customer[] }>('/customers', {
        query: { search: customerSearch, pageSize: 8 },
      }),
    enabled: showCustomer,
  });

  // Keyboard shortcuts: F1 focus search, F2 customer, F4 checkout, ESC clear search
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'F1') {
        event.preventDefault();
        scanRef.current?.focus();
      } else if (event.key === 'F2') {
        event.preventDefault();
        setShowCustomer(true);
      } else if (event.key === 'F4') {
        event.preventDefault();
        if (usePos.getState().items.length > 0) setShowCheckout(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const addMedicine = (medicine: MedicineHit) => {
    const added = pos.addItem({
      medicineId: medicine.id,
      name: medicine.name,
      nameAr: medicine.nameAr,
      barcode: medicine.barcode,
      unitPrice: Number(medicine.sellingPrice),
      taxRate: Number(medicine.taxRate),
      availableQuantity: medicine.totalQuantity,
    });
    if (!added) {
      setError(new Error(t('pos.outOfStockError')));
      window.setTimeout(() => setError(null), 2500);
    }
    setSearchTerm('');
    scanRef.current?.focus();
  };

  const scanBarcode = async (barcode: string) => {
    try {
      const medicine = await api<MedicineHit & { batches: unknown[] }>(
        `/medicines/barcode/${encodeURIComponent(barcode)}`,
        { query: { branchId } },
      );
      addMedicine(medicine);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setSearchTerm(barcode);
      } else {
        setError(err as Error);
      }
    }
  };

  const checkout = useMutation({
    mutationFn: () =>
      api<CompletedSale>('/sales', {
        method: 'POST',
        body: {
          branchId,
          customerId: pos.customerId ?? undefined,
          items: pos.items.map((item) => ({
            medicineId: item.medicineId,
            quantity: item.quantity,
            discount: item.discount || undefined,
          })),
          discountPercent: pos.discountPercent || undefined,
          paymentMethod,
          paymentCurrency: payCurrency,
          paidAmount: Number(paidAmount || 0),
          redeemPoints: pos.redeemPoints || undefined,
        },
      }),
    onSuccess: (sale) => {
      setCompletedSale(sale);
      setShowCheckout(false);
      pos.clear();
      setPaidAmount('');
      setPayCurrency(currency);
      setError(null);
    },
    onError: (err) => setError(err as Error),
  });

  const total = pos.grandTotal(REDEEM_VALUE);
  // Total expressed in the selected payment currency (for foreign tender).
  const totalInPayCurrency = total / rateFor(payCurrency);
  const paidInBase = Number(paidAmount || 0) * rateFor(payCurrency);

  return (
    <div className="grid h-[calc(100vh-7.5rem)] gap-4 lg:grid-cols-5">
      {/* Search / scan column */}
      <div className="flex flex-col gap-3 lg:col-span-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <ScanBarcode className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={scanRef}
              autoFocus
              value={searchTerm}
              placeholder={`${t('pos.scanPlaceholder')} (F1)`}
              className="ps-9"
              onChange={(event) => setSearchTerm(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && searchTerm.trim()) {
                  event.preventDefault();
                  const hits = searchResults.data?.data ?? [];
                  if (hits.length === 1) {
                    addMedicine(hits[0]);
                  } else {
                    void scanBarcode(searchTerm.trim());
                  }
                } else if (event.key === 'Escape') {
                  setSearchTerm('');
                }
              }}
            />
          </div>
          <Select
            value={branchId}
            onChange={(event) => setBranchId(event.target.value)}
            className="w-44"
          >
            {branches.data
              ?.filter((branch) => branch.isActive)
              .map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
          </Select>
        </div>

        <ErrorText error={error} />

        <div className="grid flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto md:grid-cols-3 xl:grid-cols-4">
          {searchResults.data?.data.map((medicine) => (
            <button
              key={medicine.id}
              type="button"
              onClick={() => addMedicine(medicine)}
              disabled={medicine.totalQuantity <= 0}
              className={cn(
                'flex flex-col items-start gap-1 rounded-lg border bg-card p-3 text-start shadow-sm transition-colors hover:border-primary',
                medicine.totalQuantity <= 0 && 'opacity-50',
              )}
            >
              <p className="line-clamp-2 text-sm font-medium">
                {locale === 'ar' && medicine.nameAr ? medicine.nameAr : medicine.name}
              </p>
              <p className="num text-xs text-muted-foreground">{medicine.barcode}</p>
              <div className="mt-auto flex w-full items-center justify-between">
                <span className="num text-sm font-bold text-primary">
                  {formatMoney(medicine.sellingPrice, currency, locale)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t('pos.stock')}: {medicine.totalQuantity}
                </span>
              </div>
            </button>
          ))}
          {searchTerm.length >= 2 && !searchResults.data?.data.length && !searchResults.isLoading ? (
            <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
              {t('common.noData')}
            </p>
          ) : null}
        </div>
      </div>

      {/* Cart column */}
      <div className="flex flex-col rounded-lg border bg-card lg:col-span-2">
        <div className="flex items-center justify-between border-b p-3">
          <h2 className="font-semibold">{t('pos.cart')}</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCustomer(true)}
          >
            <UserRound className="h-4 w-4" />
            {pos.customerName ?? `${t('pos.customer')} (F2)`}
          </Button>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          {pos.items.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {t('pos.emptyCart')}
            </p>
          ) : (
            pos.items.map((item: CartItem) => (
              <div key={item.medicineId} className="rounded-md border p-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium">
                    {locale === 'ar' && item.nameAr ? item.nameAr : item.name}
                  </p>
                  <button
                    type="button"
                    onClick={() => pos.removeItem(item.medicineId)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={t('common.delete')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => pos.updateQuantity(item.medicineId, item.quantity - 1)}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="num w-8 text-center text-sm font-medium">
                      {item.quantity}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      disabled={item.quantity >= item.availableQuantity}
                      onClick={() => pos.updateQuantity(item.medicineId, item.quantity + 1)}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                  <span className="num text-sm font-semibold">
                    {formatMoney(item.unitPrice * item.quantity - item.discount, currency, locale)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="space-y-2 border-t p-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label={`${t('pos.discountPercent')} (F3)`}>
              <Input
                type="number"
                min={0}
                max={100}
                value={pos.discountPercent || ''}
                onChange={(event) =>
                  pos.setDiscountPercent(Number(event.target.value || 0))
                }
              />
            </Field>
            <Field label={t('pos.redeemPoints')}>
              <Input
                type="number"
                min={0}
                max={pos.customerPoints}
                disabled={!pos.customerId}
                value={pos.redeemPoints || ''}
                onChange={(event) =>
                  pos.setRedeemPoints(Number(event.target.value || 0))
                }
              />
            </Field>
          </div>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>{t('common.subtotal')}</span>
              <span className="num">{formatMoney(pos.subtotal(), currency, locale)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>{t('common.tax')}</span>
              <span className="num">{formatMoney(pos.taxTotal(), currency, locale)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold">
              <span>{t('common.total')}</span>
              <span className="num">{formatMoney(total, currency, locale)}</span>
            </div>
          </div>
          <Button
            className="w-full"
            size="lg"
            disabled={pos.items.length === 0}
            onClick={() => {
              setPaidAmount(String(Math.ceil(total)));
              setShowCheckout(true);
            }}
          >
            {t('pos.checkout')} (F4)
          </Button>
        </div>
      </div>

      {/* Customer picker */}
      <Dialog
        open={showCustomer}
        onClose={() => setShowCustomer(false)}
        title={t('pos.customer')}
      >
        <div className="space-y-3">
          <Input
            autoFocus
            placeholder={t('common.search')}
            value={customerSearch}
            onChange={(event) => setCustomerSearch(event.target.value)}
          />
          <button
            type="button"
            className="w-full rounded-md border p-2 text-start text-sm hover:bg-accent"
            onClick={() => {
              pos.setCustomer(null, null, 0);
              setShowCustomer(false);
            }}
          >
            {t('pos.walkIn')}
          </button>
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {customers.data?.data.map((customer) => (
              <button
                key={customer.id}
                type="button"
                className="flex w-full items-center justify-between rounded-md border p-2 text-start text-sm hover:bg-accent"
                onClick={() => {
                  pos.setCustomer(customer.id, customer.name, customer.loyaltyPoints);
                  setShowCustomer(false);
                }}
              >
                <span>
                  {customer.name}
                  <span className="ms-2 text-xs text-muted-foreground" dir="ltr">
                    {customer.phone}
                  </span>
                </span>
                <span className="text-xs text-primary">
                  {customer.loyaltyPoints} {t('customers.loyaltyPoints')}
                </span>
              </button>
            ))}
          </div>
        </div>
      </Dialog>

      {/* Checkout */}
      <Dialog
        open={showCheckout}
        onClose={() => setShowCheckout(false)}
        title={t('pos.payment')}
      >
        <div className="space-y-3">
          <ErrorText error={checkout.error} />
          <div className="rounded-md bg-muted p-3 text-center">
            <p className="text-sm text-muted-foreground">{t('common.total')}</p>
            <p className="num text-3xl font-extrabold">
              {formatMoney(total, currency, locale)}
            </p>
            {payCurrency !== currency ? (
              <p className="num mt-1 text-sm font-medium text-primary">
                = {formatMoney(totalInPayCurrency, payCurrency, locale)}
                <span className="ms-1 text-xs text-muted-foreground">
                  ({t('pos.rate')} 1 {payCurrency} = {rateFor(payCurrency)} {currency})
                </span>
              </p>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('pos.paymentMethod')}>
              <Select
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value)}
              >
                <option value="CASH">{t('pos.cash')}</option>
                <option value="CREDIT_CARD">{t('pos.card')}</option>
                <option value="BANK_TRANSFER">{t('pos.bankTransfer')}</option>
                <option value="DIGITAL_WALLET">{t('pos.wallet')}</option>
              </Select>
            </Field>
            <Field label={t('pos.payCurrency')}>
              <Select
                value={payCurrency}
                onChange={(event) => {
                  setPayCurrency(event.target.value);
                  setPaidAmount('');
                }}
              >
                {payCurrencies.map((code) => (
                  <option key={code} value={code}>
                    {code}
                    {code === currency ? ` (${t('pos.baseCurrency')})` : ''}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label={`${t('pos.paidAmount')} (${payCurrency})`}>
            <Input
              type="number"
              min={0}
              step="0.01"
              autoFocus
              value={paidAmount}
              onChange={(event) => setPaidAmount(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && paidInBase + 0.005 >= total) {
                  checkout.mutate();
                }
              }}
            />
          </Field>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t('pos.change')}</span>
            <span className="num font-semibold">
              {formatMoney(Math.max(0, paidInBase - total), currency, locale)}
            </span>
          </div>
          <Button
            className="w-full"
            size="lg"
            loading={checkout.isPending}
            disabled={paidInBase + 0.005 < total}
            onClick={() => checkout.mutate()}
          >
            {t('pos.completeSale')}
          </Button>
        </div>
      </Dialog>

      {/* Receipt */}
      <Dialog
        open={Boolean(completedSale)}
        onClose={() => setCompletedSale(null)}
        title={t('pos.saleCompleted')}
      >
        {completedSale ? (
          <div className="space-y-3">
            <div id="receipt" className="rounded-md border p-4 text-sm">
              <p className="text-center font-bold">{tenant?.name}</p>
              <p className="text-center text-xs text-muted-foreground">
                {t('pos.invoiceNumber')}: {completedSale.number}
              </p>
              <div className="my-2 border-t border-dashed" />
              {completedSale.items.map((item) => (
                <div key={item.id} className="flex justify-between gap-2">
                  <span>
                    {locale === 'ar' && item.medicine.nameAr
                      ? item.medicine.nameAr
                      : item.medicine.name}{' '}
                    × {item.quantity}
                  </span>
                  <span className="num">{formatMoney(item.total, currency, locale)}</span>
                </div>
              ))}
              <div className="my-2 border-t border-dashed" />
              <div className="flex justify-between font-bold">
                <span>{t('common.total')}</span>
                <span className="num">
                  {formatMoney(completedSale.total, currency, locale)}
                </span>
              </div>
              {completedSale.paymentCurrency !== currency ? (
                <div className="flex justify-between text-muted-foreground">
                  <span>{t('pos.paidAmount')} ({completedSale.paymentCurrency})</span>
                  <span className="num">
                    {formatMoney(
                      completedSale.paidCurrencyAmount,
                      completedSale.paymentCurrency,
                      locale,
                    )}
                  </span>
                </div>
              ) : null}
              <div className="flex justify-between text-muted-foreground">
                <span>{t('pos.change')}</span>
                <span className="num">
                  {formatMoney(completedSale.changeAmount, currency, locale)}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => window.print()}
              >
                <Printer className="h-4 w-4" />
                {t('pos.printReceipt')}
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  setCompletedSale(null);
                  scanRef.current?.focus();
                }}
              >
                {t('pos.newSale')}
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
