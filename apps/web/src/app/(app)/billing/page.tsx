'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CreditCard } from 'lucide-react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { cn, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Select } from '@/components/ui/input';
import { Dialog } from '@/components/ui/dialog';
import { Badge, statusVariant } from '@/components/ui/badge';
import { ErrorText, PageHeader, Spinner } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

interface Plan {
  id: string;
  slug: string;
  name: string;
  nameAr: string;
  priceMonthly: string;
  priceYearly: string;
  maxBranches: number;
  maxUsers: number;
  maxProducts: number;
  features: string[];
}

interface CurrentSubscription {
  subscription: {
    id: string;
    status: string;
    billingCycle: string;
    endsAt: string;
    plan: Plan;
  };
  usage: { branches: number; users: number; products: number };
}

interface Invoice {
  id: string;
  number: string;
  description: string;
  amount: string;
  status: string;
  dueDate: string;
  createdAt: string;
}

export default function BillingPage() {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const [cycle, setCycle] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');
  const [payTarget, setPayTarget] = useState<Invoice | null>(null);
  const [payMethod, setPayMethod] = useState('BANK_TRANSFER');

  const current = useQuery({
    queryKey: ['subscription-current'],
    queryFn: () => api<CurrentSubscription>('/subscriptions/current'),
  });
  const plans = useQuery({
    queryKey: ['plans'],
    queryFn: () => api<Plan[]>('/subscriptions/plans', { skipAuth: true }),
  });
  const invoices = useQuery({
    queryKey: ['billing-invoices'],
    queryFn: () => api<Invoice[]>('/subscriptions/invoices'),
  });

  const subscribe = useMutation({
    mutationFn: (planSlug: string) =>
      api('/subscriptions/subscribe', {
        method: 'POST',
        body: { planSlug, cycle },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['billing-invoices'] });
    },
  });

  const pay = useMutation({
    mutationFn: () =>
      api(`/subscriptions/invoices/${payTarget!.id}/pay`, {
        method: 'POST',
        body: { method: payMethod },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['billing-invoices'] });
      void queryClient.invalidateQueries({ queryKey: ['subscription-current'] });
      setPayTarget(null);
    },
  });

  if (current.isLoading) return <Spinner />;

  const usage = current.data?.usage;
  const plan = current.data?.subscription.plan;

  const limit = (value: number | undefined) =>
    value === undefined ? '—' : value < 0 ? t('billing.unlimited') : String(value);

  return (
    <div className="space-y-6">
      <PageHeader title={t('billing.title')} />

      {current.data ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border bg-card p-5">
            <p className="text-xs uppercase text-muted-foreground">{t('billing.currentPlan')}</p>
            <div className="mt-1 flex items-center gap-2">
              <h2 className="text-2xl font-bold">
                {locale === 'ar' ? plan?.nameAr : plan?.name}
              </h2>
              <Badge variant={statusVariant(current.data.subscription.status)}>
                {t(`billing.${current.data.subscription.status}`)}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {t('billing.expiresOn')}: {formatDate(current.data.subscription.endsAt, locale)}
            </p>
          </div>
          <div className="rounded-lg border bg-card p-5">
            <p className="text-xs uppercase text-muted-foreground">{t('billing.usage')}</p>
            <div className="mt-2 space-y-2 text-sm">
              <div className="flex justify-between">
                <span>{t('billing.branches')}</span>
                <span className="num font-medium">{usage?.branches} / {limit(plan?.maxBranches)}</span>
              </div>
              <div className="flex justify-between">
                <span>{t('billing.users')}</span>
                <span className="num font-medium">{usage?.users} / {limit(plan?.maxUsers)}</span>
              </div>
              <div className="flex justify-between">
                <span>{t('billing.products')}</span>
                <span className="num font-medium">{usage?.products} / {limit(plan?.maxProducts)}</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">{t('billing.changePlan')}</h2>
          <div className="flex rounded-md border">
            {(['MONTHLY', 'YEARLY'] as const).map((billingCycle) => (
              <button
                key={billingCycle}
                type="button"
                onClick={() => setCycle(billingCycle)}
                className={cn(
                  'px-3 py-1.5 text-sm',
                  cycle === billingCycle
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground',
                )}
              >
                {t(`billing.${billingCycle.toLowerCase()}`)}
              </button>
            ))}
          </div>
        </div>
        <ErrorText error={subscribe.error} />
        <div className="grid gap-4 md:grid-cols-3">
          {plans.data?.map((planOption) => (
            <div
              key={planOption.id}
              className={cn(
                'flex flex-col rounded-lg border bg-card p-5',
                planOption.slug === plan?.slug && 'border-primary ring-1 ring-primary',
              )}
            >
              <h3 className="font-bold">
                {locale === 'ar' ? planOption.nameAr : planOption.name}
              </h3>
              <p className="num mt-1 text-2xl font-extrabold">
                ${Number(cycle === 'YEARLY' ? planOption.priceYearly : planOption.priceMonthly)}
                <span className="text-sm font-normal text-muted-foreground">
                  {cycle === 'YEARLY' ? t('billing.perYear') : t('billing.perMonth')}
                </span>
              </p>
              <ul className="mt-3 flex-1 space-y-1.5 text-sm">
                {(planOption.features ?? []).map((feature) => (
                  <li key={feature} className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-primary" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Button
                className="mt-4"
                variant={planOption.slug === plan?.slug ? 'outline' : 'default'}
                loading={subscribe.isPending}
                onClick={() => subscribe.mutate(planOption.slug)}
              >
                {t('billing.subscribe')}
              </Button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-3 font-semibold">{t('billing.invoices')}</h2>
        <Table>
          <THead>
            <TR>
              <TH>{t('billing.invoiceNumber')}</TH>
              <TH>{t('medicines.description')}</TH>
              <TH className="text-end">{t('common.amount')}</TH>
              <TH>{t('billing.dueDate')}</TH>
              <TH>{t('common.status')}</TH>
              <TH className="text-end">{t('common.actions')}</TH>
            </TR>
          </THead>
          <TBody>
            {invoices.data?.map((invoice) => (
              <TR key={invoice.id}>
                <TD className="font-medium">{invoice.number}</TD>
                <TD>{invoice.description}</TD>
                <TD className="num text-end">${Number(invoice.amount)}</TD>
                <TD>{formatDate(invoice.dueDate, locale)}</TD>
                <TD>
                  <Badge variant={statusVariant(invoice.status)}>
                    {t(`billing.${invoice.status}`)}
                  </Badge>
                </TD>
                <TD className="text-end">
                  {invoice.status === 'PENDING' ? (
                    <Button size="sm" onClick={() => setPayTarget(invoice)}>
                      <CreditCard className="h-3.5 w-3.5" />
                      {t('billing.payNow')}
                    </Button>
                  ) : null}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>

      <Dialog
        open={Boolean(payTarget)}
        onClose={() => setPayTarget(null)}
        title={`${t('billing.payNow')} — ${payTarget?.number ?? ''}`}
      >
        <div className="space-y-3">
          <ErrorText error={pay.error} />
          <p className="num text-center text-2xl font-bold">${Number(payTarget?.amount ?? 0)}</p>
          <Field label={t('pos.paymentMethod')}>
            <Select value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
              <option value="BANK_TRANSFER">{t('pos.bankTransfer')}</option>
              <option value="CREDIT_CARD">{t('pos.card')}</option>
              <option value="DIGITAL_WALLET">{t('pos.wallet')}</option>
              <option value="CASH">{t('pos.cash')}</option>
            </Select>
          </Field>
          <Button className="w-full" loading={pay.isPending} onClick={() => pay.mutate()}>
            {t('common.confirm')}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
