'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/stores/auth';
import { formatMoney } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Dialog } from '@/components/ui/dialog';
import { ErrorText } from '@/components/ui/misc';

interface TenantSettings {
  currency: string;
  settings: { exchangeRates: Record<string, number> } | null;
}

/**
 * Records a settlement against a customer's outstanding debt. Supports
 * paying in a foreign currency converted at the tenant's market rate.
 */
export function CustomerPaymentDialog({
  customer,
  onClose,
}: {
  customer: { id: string; name: string; balance: number } | null;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const { tenant } = useAuth();
  const base = tenant?.currency ?? 'ILS';
  const queryClient = useQueryClient();

  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');
  const [payCurrency, setPayCurrency] = useState(base);
  const [note, setNote] = useState('');

  const tenantInfo = useQuery({
    queryKey: ['tenant-me'],
    queryFn: () => api<TenantSettings>('/tenant/me'),
    enabled: Boolean(customer),
  });
  const rates = tenantInfo.data?.settings?.exchangeRates ?? {};
  const currencies = [base, ...Object.keys(rates)];
  const rate = payCurrency === base ? 1 : Number(rates[payCurrency]) || 1;

  const save = useMutation({
    mutationFn: () =>
      api(`/customers/${customer!.id}/payments`, {
        method: 'POST',
        body: {
          amount: Number(amount),
          method,
          paymentCurrency: payCurrency,
          note: note || undefined,
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
      void queryClient.invalidateQueries({ queryKey: ['debts'] });
      void queryClient.invalidateQueries({ queryKey: ['customer-statement'] });
      setAmount('');
      setNote('');
      setPayCurrency(base);
      onClose();
    },
  });

  if (!customer) return null;
  const inBase = Number(amount || 0) * rate;

  return (
    <Dialog
      open={Boolean(customer)}
      onClose={onClose}
      title={`${t('customers.recordPayment')} — ${customer.name}`}
    >
      <div className="space-y-3">
        <ErrorText error={save.error} />
        <div className="rounded-md bg-amber-500/10 p-3 text-center">
          <p className="text-sm text-muted-foreground">{t('customers.balance')}</p>
          <p className="num text-2xl font-bold text-amber-700 dark:text-amber-400">
            {formatMoney(customer.balance, base, locale)}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('pos.paymentMethod')}>
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="CASH">{t('pos.cash')}</option>
              <option value="CREDIT_CARD">{t('pos.card')}</option>
              <option value="BANK_TRANSFER">{t('pos.bankTransfer')}</option>
              <option value="DIGITAL_WALLET">{t('pos.wallet')}</option>
            </Select>
          </Field>
          <Field label={t('pos.payCurrency')}>
            <Select
              value={payCurrency}
              onChange={(e) => setPayCurrency(e.target.value)}
            >
              {currencies.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label={`${t('common.amount')} (${payCurrency})`}>
          <Input
            type="number"
            min={0.01}
            step="0.01"
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        {payCurrency !== base ? (
          <p className="num text-sm text-muted-foreground">
            = {formatMoney(inBase, base, locale)} ({t('pos.rate')} {rate})
          </p>
        ) : null}
        <Field label={t('common.notes')}>
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <Button
          className="w-full"
          loading={save.isPending}
          disabled={Number(amount) <= 0}
          onClick={() => save.mutate()}
        >
          {t('customers.settle')}
        </Button>
      </div>
    </Dialog>
  );
}
